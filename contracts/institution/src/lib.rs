use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, BorshStorageKey, NearToken, PanicOnDefault, env, near, require};
use primitive_types::U256;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

const MAX_NAME_BYTES: usize = 80;
const MAX_SUMMARY_BYTES: usize = 600;
const MAX_METADATA_URI_BYTES: usize = 500;
const MAX_MILESTONES: usize = 16;
const MAX_VERIFIERS: usize = 12;
const MIN_VERIFIERS: usize = 3;

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Contributions,
    PendingRefunds,
}

const REFUND_CALLBACK_GAS: near_sdk::Gas = near_sdk::Gas::from_tgas(15);

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct MilestoneConfig {
    pub id: String,
    pub title: String,
    pub beneficiary: AccountId,
    pub budget: U128,
    pub deadline_ns: U64,
    pub acceptance_criteria: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct InstitutionCharter {
    pub id: String,
    pub founder: AccountId,
    pub name: String,
    pub mission_summary: String,
    pub charter_hash: String,
    pub metadata_uri: String,
    pub funding_deadline_ns: U64,
    pub expires_at_ns: U64,
    pub settlement_grace_ns: U64,
    pub challenge_window_ns: U64,
    pub minimum_funding: U128,
    pub funding_cap: U128,
    pub verifiers: Vec<AccountId>,
    pub verifier_threshold: u8,
    pub milestones: Vec<MilestoneConfig>,
    pub refund_policy: RefundPolicy,
    pub code_version: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Eq)]
pub enum RefundPolicy {
    ProRataContributors,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InstitutionStatus {
    Funding,
    FundingFailed,
    Active,
    Settling,
    Archived,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MilestoneStatus {
    Planned,
    UnderReview,
    Disputed,
    PayoutReady,
    PayoutPending,
    Retryable,
    Paid,
    Rejected,
    ExpiredUnpaid,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum AttestationDecision {
    Approve,
    Reject,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct MilestoneState {
    pub id: String,
    pub status: MilestoneStatus,
    pub evidence_digest: Option<String>,
    pub evidence_uri: Option<String>,
    pub review_ends_ns: Option<U64>,
    pub approvals: Vec<AccountId>,
    pub rejections: Vec<AccountId>,
    pub challenge_reason_hash: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TreasuryView {
    pub total_received: U128,
    pub confirmed_milestone_spend: U128,
    pub pending_outbound: U128,
    pub confirmed_refunds: U128,
    pub spendable: U128,
    pub storage_reserve: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct ClosureView {
    pub archived: bool,
    pub charter_hash: String,
    pub total_received: U128,
    pub confirmed_milestone_spend: U128,
    pub refund_pool: U128,
    pub confirmed_refunds: U128,
    pub pending_outbound: U128,
    pub all_refunds_claimed: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Institution {
    charter: InstitutionCharter,
    status: InstitutionStatus,
    total_received: u128,
    confirmed_milestone_spend: u128,
    pending_outbound: u128,
    confirmed_refunds: u128,
    storage_reserve: u128,
    contributions: LookupMap<AccountId, u128>,
    pending_refunds: LookupMap<AccountId, u128>,
    milestone_states: Vec<MilestoneState>,
    contributor_count: u32,
    refunds_finalized: bool,
    refund_pool: u128,
    refund_denominator: u128,
}

#[near]
impl Institution {
    #[init]
    #[payable]
    pub fn init(charter: InstitutionCharter) -> Self {
        require!(!env::state_exists(), "ERR_ALREADY_INITIALIZED");
        validate_charter(&charter, env::block_timestamp());
        require!(
            env::signer_account_id() == charter.founder,
            "ERR_FOUNDER_MUST_INITIALIZE"
        );

        let storage_reserve = env::attached_deposit().as_yoctonear();
        require!(storage_reserve > 0, "ERR_STORAGE_RESERVE_REQUIRED");

        let milestone_states = charter
            .milestones
            .iter()
            .map(|milestone| MilestoneState {
                id: milestone.id.clone(),
                status: MilestoneStatus::Planned,
                evidence_digest: None,
                evidence_uri: None,
                review_ends_ns: None,
                approvals: vec![],
                rejections: vec![],
                challenge_reason_hash: None,
            })
            .collect();
        Self {
            charter,
            status: InstitutionStatus::Funding,
            total_received: 0,
            confirmed_milestone_spend: 0,
            pending_outbound: 0,
            confirmed_refunds: 0,
            storage_reserve,
            contributions: LookupMap::new(StorageKey::Contributions),
            pending_refunds: LookupMap::new(StorageKey::PendingRefunds),
            milestone_states,
            contributor_count: 0,
            refunds_finalized: false,
            refund_pool: 0,
            refund_denominator: 0,
        }
    }

    #[payable]
    pub fn contribute(&mut self) {
        self.refresh_deadline_guards();
        require!(self.status == InstitutionStatus::Funding, "ERR_NOT_FUNDING");
        require!(
            env::block_timestamp() < self.charter.funding_deadline_ns.0,
            "ERR_FUNDING_CLOSED"
        );

        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "ERR_ZERO_CONTRIBUTION");
        let next_total = self
            .total_received
            .checked_add(amount)
            .expect("ERR_AMOUNT_OVERFLOW");
        require!(
            next_total <= self.charter.funding_cap.0,
            "ERR_FUNDING_CAP_EXCEEDED"
        );

        let contributor = env::predecessor_account_id();
        let prior = self.contributions.get(&contributor).unwrap_or(0);
        if prior == 0 {
            self.contributor_count = self
                .contributor_count
                .checked_add(1)
                .expect("ERR_CONTRIBUTOR_OVERFLOW");
        }
        self.contributions.insert(
            &contributor,
            &prior.checked_add(amount).expect("ERR_AMOUNT_OVERFLOW"),
        );
        self.total_received = next_total;
    }

    pub fn activate(&mut self) {
        self.refresh_deadline_guards();
        require!(self.status == InstitutionStatus::Funding, "ERR_NOT_FUNDING");
        require!(
            env::block_timestamp() < self.charter.expires_at_ns.0,
            "ERR_INSTITUTION_EXPIRED"
        );
        require!(
            self.total_received >= self.charter.minimum_funding.0,
            "ERR_FUNDING_FLOOR_NOT_MET"
        );
        self.status = InstitutionStatus::Active;
    }

    pub fn submit_evidence(&mut self, milestone_id: String, digest: String, evidence_uri: String) {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        require!(
            digest.len() == 64 && digest.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "ERR_INVALID_EVIDENCE_DIGEST"
        );
        require!(
            !evidence_uri.is_empty() && evidence_uri.len() <= 500,
            "ERR_INVALID_EVIDENCE_URI"
        );
        let index = self.milestone_index(&milestone_id);
        let config = &self.charter.milestones[index];
        require!(
            env::predecessor_account_id() == config.beneficiary,
            "ERR_ONLY_BENEFICIARY"
        );
        require!(
            self.milestone_states[index].status == MilestoneStatus::Planned,
            "ERR_EVIDENCE_ALREADY_SUBMITTED"
        );
        let review_ends = env::block_timestamp()
            .checked_add(self.charter.challenge_window_ns.0)
            .expect("ERR_TIMESTAMP_OVERFLOW");
        require!(
            review_ends <= config.deadline_ns.0 && review_ends <= self.charter.expires_at_ns.0,
            "ERR_INSUFFICIENT_REVIEW_TIME"
        );
        let state = &mut self.milestone_states[index];
        state.status = MilestoneStatus::UnderReview;
        state.evidence_digest = Some(digest);
        state.evidence_uri = Some(evidence_uri);
        state.review_ends_ns = Some(U64(review_ends));
    }

    pub fn attest(&mut self, milestone_id: String, decision: AttestationDecision) {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        require!(
            env::block_timestamp() < self.charter.expires_at_ns.0,
            "ERR_INSTITUTION_EXPIRED"
        );
        let verifier = env::predecessor_account_id();
        require!(
            self.charter.verifiers.contains(&verifier),
            "ERR_NOT_VERIFIER"
        );
        let index = self.milestone_index(&milestone_id);
        let state = &mut self.milestone_states[index];
        require!(
            matches!(
                state.status,
                MilestoneStatus::UnderReview | MilestoneStatus::Disputed
            ),
            "ERR_NOT_REVIEWABLE"
        );
        require!(
            env::block_timestamp() < state.review_ends_ns.expect("ERR_REVIEW_END_MISSING").0,
            "ERR_REVIEW_WINDOW_CLOSED"
        );
        require!(
            !state.approvals.contains(&verifier) && !state.rejections.contains(&verifier),
            "ERR_ALREADY_ATTESTED"
        );
        match decision {
            AttestationDecision::Approve => state.approvals.push(verifier),
            AttestationDecision::Reject => state.rejections.push(verifier),
        }
    }

    pub fn challenge(
        &mut self,
        milestone_id: String,
        evidence_digest: String,
        reason_hash: String,
    ) {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        let challenger = env::predecessor_account_id();
        require!(
            self.contributions.get(&challenger).unwrap_or(0) > 0,
            "ERR_ONLY_CONTRIBUTOR"
        );
        let index = self.milestone_index(&milestone_id);
        let state = &mut self.milestone_states[index];
        require!(
            state.status == MilestoneStatus::UnderReview,
            "ERR_NOT_CHALLENGEABLE"
        );
        require!(
            state.evidence_digest.as_deref() == Some(evidence_digest.as_str()),
            "ERR_EVIDENCE_DIGEST_MISMATCH"
        );
        require!(
            reason_hash.len() == 64 && reason_hash.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "ERR_INVALID_REASON_HASH"
        );
        require!(
            env::block_timestamp() < state.review_ends_ns.expect("ERR_REVIEW_END_MISSING").0,
            "ERR_CHALLENGE_WINDOW_CLOSED"
        );
        state.challenge_reason_hash = Some(reason_hash);
        state.status = MilestoneStatus::Disputed;
    }

    pub fn finalize_review(&mut self, milestone_id: String) {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        let index = self.milestone_index(&milestone_id);
        let state = &mut self.milestone_states[index];
        require!(
            matches!(
                state.status,
                MilestoneStatus::UnderReview | MilestoneStatus::Disputed
            ),
            "ERR_NOT_REVIEWABLE"
        );
        let now = env::block_timestamp();
        require!(
            now >= state.review_ends_ns.expect("ERR_REVIEW_END_MISSING").0,
            "ERR_REVIEW_WINDOW_OPEN"
        );
        if now >= self.charter.expires_at_ns.0 {
            state.status = MilestoneStatus::ExpiredUnpaid;
            return;
        }
        let threshold = usize::from(self.charter.verifier_threshold);
        if state.approvals.len() >= threshold {
            state.status = MilestoneStatus::PayoutReady;
        } else if state.rejections.len() >= threshold
            || state.status == MilestoneStatus::UnderReview
        {
            state.status = MilestoneStatus::Rejected;
        } else {
            env::panic_str("ERR_DISPUTE_UNRESOLVED");
        }
    }

    pub fn request_payout(&mut self, milestone_id: String) -> near_sdk::Promise {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        require!(
            env::block_timestamp() < self.charter.expires_at_ns.0,
            "ERR_INSTITUTION_EXPIRED"
        );
        let index = self.milestone_index(&milestone_id);
        let config = &self.charter.milestones[index];
        require!(
            env::predecessor_account_id() == config.beneficiary,
            "ERR_ONLY_BENEFICIARY"
        );
        require!(
            matches!(
                self.milestone_states[index].status,
                MilestoneStatus::PayoutReady | MilestoneStatus::Retryable
            ),
            "ERR_PAYOUT_NOT_READY"
        );
        let amount = config.budget.0;
        let treasury = self.get_treasury();
        require!(
            treasury.spendable.0 >= amount,
            "ERR_INSUFFICIENT_SPENDABLE_BALANCE"
        );
        self.pending_outbound = self
            .pending_outbound
            .checked_add(amount)
            .expect("ERR_AMOUNT_OVERFLOW");
        self.milestone_states[index].status = MilestoneStatus::PayoutPending;
        let callback_args = near_sdk::serde_json::to_vec(&PayoutCallbackArgs {
            milestone_id,
            amount: U128(amount),
        })
        .expect("ERR_SERIALIZE_CALLBACK");
        near_sdk::Promise::new(config.beneficiary.clone())
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                near_sdk::Promise::new(env::current_account_id()).function_call(
                    "on_payout_resolved",
                    callback_args,
                    NearToken::from_yoctonear(0),
                    REFUND_CALLBACK_GAS,
                ),
            )
    }

    #[private]
    pub fn on_payout_resolved(
        &mut self,
        milestone_id: String,
        amount: U128,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        let index = self.milestone_index(&milestone_id);
        require!(
            self.milestone_states[index].status == MilestoneStatus::PayoutPending,
            "ERR_UNKNOWN_PAYOUT_OPERATION"
        );
        require!(
            self.charter.milestones[index].budget.0 == amount.0,
            "ERR_PAYOUT_AMOUNT_MISMATCH"
        );
        self.pending_outbound = self
            .pending_outbound
            .checked_sub(amount.0)
            .expect("ERR_ACCOUNTING_INVARIANT");
        if result.is_err() {
            // A payout may resolve after the fixed expiration. It must then become
            // terminal; retrying is prohibited after expiry and would block settlement.
            self.milestone_states[index].status = if self.status == InstitutionStatus::Settling
                || env::block_timestamp() >= self.charter.expires_at_ns.0
            {
                MilestoneStatus::ExpiredUnpaid
            } else {
                MilestoneStatus::Retryable
            };
            return false;
        }
        self.confirmed_milestone_spend = self
            .confirmed_milestone_spend
            .checked_add(amount.0)
            .expect("ERR_AMOUNT_OVERFLOW");
        self.milestone_states[index].status = MilestoneStatus::Paid;
        true
    }

    pub fn mark_funding_failed(&mut self) {
        require!(self.status == InstitutionStatus::Funding, "ERR_NOT_FUNDING");
        let now = env::block_timestamp();
        let below_floor_after_cutoff = now >= self.charter.funding_deadline_ns.0
            && self.total_received < self.charter.minimum_funding.0;
        let expired_before_activation = now >= self.charter.expires_at_ns.0;
        require!(
            below_floor_after_cutoff || expired_before_activation,
            "ERR_FUNDING_CAN_CONTINUE"
        );
        self.status = InstitutionStatus::FundingFailed;
    }

    pub fn finalize_failed_funding(&mut self) {
        require!(
            self.status == InstitutionStatus::FundingFailed,
            "ERR_NOT_FAILED_FUNDING"
        );
        require!(self.pending_outbound == 0, "ERR_PENDING_OUTBOUND");
        self.refund_pool = self.total_received;
        self.refund_denominator = self.total_received;
        self.refunds_finalized = true;
        self.status = InstitutionStatus::Archived;
    }

    pub fn begin_settlement(&mut self) {
        require!(self.status == InstitutionStatus::Active, "ERR_NOT_ACTIVE");
        let expired = env::block_timestamp() >= self.charter.expires_at_ns.0;
        let all_terminal = self.milestone_states.iter().all(|state| {
            matches!(
                state.status,
                MilestoneStatus::Paid | MilestoneStatus::Rejected | MilestoneStatus::ExpiredUnpaid
            )
        });
        require!(expired || all_terminal, "ERR_SETTLEMENT_NOT_AVAILABLE");
        if expired {
            for state in &mut self.milestone_states {
                if !matches!(
                    state.status,
                    MilestoneStatus::Paid
                        | MilestoneStatus::PayoutPending
                        | MilestoneStatus::Rejected
                        | MilestoneStatus::ExpiredUnpaid
                ) {
                    state.status = MilestoneStatus::ExpiredUnpaid;
                }
            }
        }
        self.status = InstitutionStatus::Settling;
    }

    pub fn finalize_settlement(&mut self) {
        require!(
            self.status == InstitutionStatus::Settling,
            "ERR_NOT_SETTLING"
        );
        require!(self.pending_outbound == 0, "ERR_PENDING_OUTBOUND");
        require!(
            self.milestone_states.iter().all(|state| matches!(
                state.status,
                MilestoneStatus::Paid | MilestoneStatus::Rejected | MilestoneStatus::ExpiredUnpaid
            )),
            "ERR_MILESTONE_NOT_TERMINAL"
        );
        self.refund_pool = self
            .total_received
            .checked_sub(self.confirmed_milestone_spend)
            .and_then(|value| value.checked_sub(self.confirmed_refunds))
            .expect("ERR_ACCOUNTING_INVARIANT");
        self.refund_denominator = self.total_received;
        self.refunds_finalized = true;
        self.status = InstitutionStatus::Archived;
    }

    pub fn claim_refund(&mut self) -> near_sdk::Promise {
        require!(
            self.status == InstitutionStatus::Archived && self.refunds_finalized,
            "ERR_REFUNDS_NOT_AVAILABLE"
        );
        let claimant = env::predecessor_account_id();
        require!(
            self.pending_refunds.get(&claimant).is_none(),
            "ERR_REFUND_PENDING"
        );
        let amount = self.refund_entitlement(&claimant);
        require!(amount > 0, "ERR_NOTHING_TO_CLAIM");

        self.pending_refunds.insert(&claimant, &amount);
        self.pending_outbound = self
            .pending_outbound
            .checked_add(amount)
            .expect("ERR_AMOUNT_OVERFLOW");
        let callback_args = near_sdk::serde_json::to_vec(&RefundCallbackArgs {
            claimant: claimant.clone(),
        })
        .expect("ERR_SERIALIZE_CALLBACK");
        near_sdk::Promise::new(claimant)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                near_sdk::Promise::new(env::current_account_id()).function_call(
                    "on_refund_resolved",
                    callback_args,
                    NearToken::from_yoctonear(0),
                    REFUND_CALLBACK_GAS,
                ),
            )
    }

    #[private]
    pub fn on_refund_resolved(
        &mut self,
        claimant: AccountId,
        #[callback_result] result: Result<(), near_sdk::PromiseError>,
    ) -> bool {
        let amount = self
            .pending_refunds
            .remove(&claimant)
            .expect("ERR_UNKNOWN_REFUND_OPERATION");
        self.pending_outbound = self
            .pending_outbound
            .checked_sub(amount)
            .expect("ERR_ACCOUNTING_INVARIANT");
        if result.is_err() {
            return false;
        }
        self.contributions.insert(&claimant, &0);
        self.confirmed_refunds = self
            .confirmed_refunds
            .checked_add(amount)
            .expect("ERR_AMOUNT_OVERFLOW");
        true
    }

    pub fn get_charter(&self) -> InstitutionCharter {
        self.charter.clone()
    }

    pub fn get_status(&self) -> InstitutionStatus {
        self.status
    }

    pub fn get_treasury(&self) -> TreasuryView {
        let committed = self
            .confirmed_milestone_spend
            .checked_add(self.pending_outbound)
            .and_then(|value| value.checked_add(self.confirmed_refunds))
            .expect("ERR_ACCOUNTING_OVERFLOW");
        TreasuryView {
            total_received: U128(self.total_received),
            confirmed_milestone_spend: U128(self.confirmed_milestone_spend),
            pending_outbound: U128(self.pending_outbound),
            confirmed_refunds: U128(self.confirmed_refunds),
            spendable: U128(
                self.total_received
                    .checked_sub(committed)
                    .expect("ERR_ACCOUNTING_INVARIANT"),
            ),
            storage_reserve: U128(self.storage_reserve),
        }
    }

    pub fn get_contribution(&self, account_id: AccountId) -> U128 {
        U128(self.contributions.get(&account_id).unwrap_or(0))
    }

    pub fn get_contributor_count(&self) -> u32 {
        self.contributor_count
    }

    pub fn get_closure_record(&self) -> Option<ClosureView> {
        if self.status != InstitutionStatus::Archived {
            return None;
        }
        Some(ClosureView {
            archived: true,
            charter_hash: self.charter.charter_hash.clone(),
            total_received: U128(self.total_received),
            confirmed_milestone_spend: U128(self.confirmed_milestone_spend),
            refund_pool: U128(self.refund_pool),
            confirmed_refunds: U128(self.confirmed_refunds),
            pending_outbound: U128(self.pending_outbound),
            all_refunds_claimed: self.confirmed_refunds == self.refund_pool
                && self.pending_outbound == 0,
        })
    }

    pub fn get_milestones(&self) -> Vec<MilestoneConfig> {
        self.charter.milestones.clone()
    }

    pub fn get_milestone_states(&self) -> Vec<MilestoneState> {
        self.milestone_states.clone()
    }

    pub fn get_claimable_refund(&self, account_id: AccountId) -> U128 {
        if self.status != InstitutionStatus::Archived
            || !self.refunds_finalized
            || self.pending_refunds.get(&account_id).is_some()
        {
            return U128(0);
        }
        U128(self.refund_entitlement(&account_id))
    }

    fn refresh_deadline_guards(&mut self) {
        if self.status == InstitutionStatus::Funding
            && env::block_timestamp() >= self.charter.expires_at_ns.0
        {
            self.status = InstitutionStatus::FundingFailed;
        }
    }

    fn milestone_index(&self, milestone_id: &str) -> usize {
        self.charter
            .milestones
            .iter()
            .position(|milestone| milestone.id == milestone_id)
            .expect("ERR_MILESTONE_NOT_FOUND")
    }

    fn refund_entitlement(&self, account_id: &AccountId) -> u128 {
        let contribution = self.contributions.get(account_id).unwrap_or(0);
        if contribution == 0 || self.refund_denominator == 0 {
            return 0;
        }
        let value = U256::from(self.refund_pool) * U256::from(contribution)
            / U256::from(self.refund_denominator);
        require!(value <= U256::from(u128::MAX), "ERR_REFUND_OVERFLOW");
        value.as_u128()
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct RefundCallbackArgs {
    claimant: AccountId,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PayoutCallbackArgs {
    milestone_id: String,
    amount: U128,
}

fn validate_charter(charter: &InstitutionCharter, now: u64) {
    require!(
        !charter.id.is_empty() && charter.id.len() <= 64,
        "ERR_INVALID_ID"
    );
    require!(
        !charter.name.is_empty() && charter.name.len() <= MAX_NAME_BYTES,
        "ERR_INVALID_NAME"
    );
    require!(
        !charter.mission_summary.is_empty() && charter.mission_summary.len() <= MAX_SUMMARY_BYTES,
        "ERR_INVALID_MISSION_SUMMARY"
    );
    require!(
        charter.metadata_uri.len() <= MAX_METADATA_URI_BYTES,
        "ERR_METADATA_URI_TOO_LONG"
    );
    require!(
        charter.charter_hash.len() == 64
            && charter
                .charter_hash
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit()),
        "ERR_INVALID_CHARTER_HASH"
    );
    require!(
        charter.funding_deadline_ns.0 > now,
        "ERR_FUNDING_DEADLINE_NOT_FUTURE"
    );
    require!(
        charter.funding_deadline_ns.0 < charter.expires_at_ns.0,
        "ERR_DEADLINE_ORDER"
    );
    require!(
        charter.challenge_window_ns.0 > 0,
        "ERR_ZERO_CHALLENGE_WINDOW"
    );
    require!(
        charter.challenge_window_ns.0 < charter.expires_at_ns.0 - charter.funding_deadline_ns.0,
        "ERR_CHALLENGE_WINDOW_TOO_LONG"
    );
    require!(charter.minimum_funding.0 > 0, "ERR_ZERO_FUNDING_FLOOR");
    require!(
        charter.minimum_funding.0 <= charter.funding_cap.0,
        "ERR_FUNDING_RANGE"
    );
    require!(
        !charter.milestones.is_empty() && charter.milestones.len() <= MAX_MILESTONES,
        "ERR_MILESTONE_COUNT"
    );
    require!(
        charter.verifiers.len() >= MIN_VERIFIERS && charter.verifiers.len() <= MAX_VERIFIERS,
        "ERR_VERIFIER_COUNT"
    );
    require!(
        charter.verifier_threshold >= 2
            && usize::from(charter.verifier_threshold) <= charter.verifiers.len(),
        "ERR_VERIFIER_THRESHOLD"
    );

    let mut verifier_set = BTreeSet::new();
    for verifier in &charter.verifiers {
        require!(verifier != &charter.founder, "ERR_FOUNDER_CANNOT_VERIFY");
        require!(
            verifier_set.insert(verifier.clone()),
            "ERR_DUPLICATE_VERIFIER"
        );
    }

    let mut milestone_ids = BTreeSet::new();
    let mut budget_total = 0u128;
    for milestone in &charter.milestones {
        require!(
            !milestone.id.is_empty() && milestone.id.len() <= 64,
            "ERR_INVALID_MILESTONE_ID"
        );
        require!(
            milestone_ids.insert(milestone.id.clone()),
            "ERR_DUPLICATE_MILESTONE_ID"
        );
        require!(
            !milestone.title.is_empty() && milestone.title.len() <= 120,
            "ERR_INVALID_MILESTONE_TITLE"
        );
        require!(
            !milestone.acceptance_criteria.is_empty()
                && milestone.acceptance_criteria.len() <= 1000,
            "ERR_INVALID_ACCEPTANCE_CRITERIA"
        );
        require!(
            milestone.deadline_ns.0 <= charter.expires_at_ns.0,
            "ERR_MILESTONE_AFTER_EXPIRY"
        );
        require!(
            milestone.deadline_ns.0 > charter.funding_deadline_ns.0,
            "ERR_MILESTONE_BEFORE_FUNDING_END"
        );
        require!(
            milestone.beneficiary != charter.founder,
            "ERR_FOUNDER_CANNOT_BE_BENEFICIARY"
        );
        require!(
            !verifier_set.contains(&milestone.beneficiary),
            "ERR_VERIFIER_BENEFICIARY_CONFLICT"
        );
        require!(milestone.budget.0 > 0, "ERR_ZERO_MILESTONE_BUDGET");
        budget_total = budget_total
            .checked_add(milestone.budget.0)
            .expect("ERR_BUDGET_OVERFLOW");
    }
    require!(
        budget_total <= charter.minimum_funding.0,
        "ERR_BUDGET_EXCEEDS_FLOOR"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    const NOW: u64 = 1_800_000_000_000_000_000;
    const ONE_NEAR: u128 = 10u128.pow(24);

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, timestamp: u64, deposit: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("institution.testnet"))
            .predecessor_account_id(account(predecessor))
            .signer_account_id(account(predecessor))
            .block_timestamp(timestamp)
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(builder.build());
    }

    fn charter() -> InstitutionCharter {
        InstitutionCharter {
            id: "garden-repair".into(),
            founder: account("founder.testnet"),
            name: "Repair the garden".into(),
            mission_summary: "Repair a public garden path before the fixed deadline.".into(),
            charter_hash: "a".repeat(64),
            metadata_uri: "https://example.test/charter.json".into(),
            funding_deadline_ns: U64(NOW + 10),
            expires_at_ns: U64(NOW + 100),
            settlement_grace_ns: U64(10),
            challenge_window_ns: U64(5),
            minimum_funding: U128(10 * ONE_NEAR),
            funding_cap: U128(15 * ONE_NEAR),
            verifiers: vec![
                account("v1.testnet"),
                account("v2.testnet"),
                account("v3.testnet"),
            ],
            verifier_threshold: 2,
            milestones: vec![MilestoneConfig {
                id: "path".into(),
                title: "Repair path".into(),
                beneficiary: account("builder.testnet"),
                budget: U128(8 * ONE_NEAR),
                deadline_ns: U64(NOW + 80),
                acceptance_criteria: "The path edge is repaired and documented.".into(),
            }],
            refund_policy: RefundPolicy::ProRataContributors,
            code_version: "0.1.0".into(),
        }
    }

    fn init() -> Institution {
        context("founder.testnet", NOW, ONE_NEAR);
        Institution::init(charter())
    }

    #[test]
    #[should_panic(expected = "ERR_DEADLINE_ORDER")]
    fn rejects_invalid_deadline_order() {
        context("founder.testnet", NOW, ONE_NEAR);
        let mut value = charter();
        value.funding_deadline_ns = value.expires_at_ns;
        Institution::init(value);
    }

    #[test]
    #[should_panic(expected = "ERR_BUDGET_EXCEEDS_FLOOR")]
    fn rejects_budget_above_floor() {
        context("founder.testnet", NOW, ONE_NEAR);
        let mut value = charter();
        value.milestones[0].budget = U128(11 * ONE_NEAR);
        Institution::init(value);
    }

    #[test]
    #[should_panic(expected = "ERR_DUPLICATE_VERIFIER")]
    fn rejects_duplicate_verifier() {
        context("founder.testnet", NOW, ONE_NEAR);
        let mut value = charter();
        value.verifiers[2] = value.verifiers[1].clone();
        Institution::init(value);
    }

    #[test]
    fn accepts_contributions_and_activates_permissionlessly() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 6 * ONE_NEAR);
        contract.contribute();
        context("bob.testnet", NOW + 2, 4 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 11, 0);
        contract.activate();
        assert_eq!(contract.get_status(), InstitutionStatus::Active);
        assert_eq!(
            contract.get_contribution(account("alice.testnet")),
            U128(6 * ONE_NEAR)
        );
        assert_eq!(contract.get_contributor_count(), 2);
    }

    #[test]
    #[should_panic(expected = "ERR_FUNDING_CAP_EXCEEDED")]
    fn rejects_contribution_above_cap() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 16 * ONE_NEAR);
        contract.contribute();
    }

    #[test]
    fn expiration_prevents_activation_and_marks_failed() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 10 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 100, 0);
        contract.mark_funding_failed();
        assert_eq!(contract.get_status(), InstitutionStatus::FundingFailed);
    }

    #[test]
    fn failed_funding_refund_is_reserved_then_confirmed() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 4 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 10, 0);
        contract.mark_funding_failed();
        contract.finalize_failed_funding();
        assert_eq!(
            contract.get_claimable_refund(account("alice.testnet")),
            U128(4 * ONE_NEAR)
        );

        context("alice.testnet", NOW + 11, 0);
        let promise = contract.claim_refund();
        drop(promise);
        assert_eq!(
            contract.get_claimable_refund(account("alice.testnet")),
            U128(0)
        );
        assert_eq!(contract.get_treasury().pending_outbound, U128(4 * ONE_NEAR));

        context("institution.testnet", NOW + 12, 0);
        assert!(contract.on_refund_resolved(account("alice.testnet"), Ok(())));
        assert_eq!(
            contract.get_treasury().confirmed_refunds,
            U128(4 * ONE_NEAR)
        );
        assert_eq!(contract.get_treasury().pending_outbound, U128(0));
    }

    #[test]
    fn failed_refund_callback_restores_claimability() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 4 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 10, 0);
        contract.mark_funding_failed();
        contract.finalize_failed_funding();
        context("alice.testnet", NOW + 11, 0);
        drop(contract.claim_refund());
        context("institution.testnet", NOW + 12, 0);
        assert!(!contract.on_refund_resolved(
            account("alice.testnet"),
            Err(near_sdk::PromiseError::Failed)
        ));
        assert_eq!(
            contract.get_claimable_refund(account("alice.testnet")),
            U128(4 * ONE_NEAR)
        );
        assert_eq!(contract.get_treasury().confirmed_refunds, U128(0));
    }

    #[test]
    fn approved_milestone_payout_is_reserved_and_confirmed() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 10 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 11, 0);
        contract.activate();
        context("builder.testnet", NOW + 12, 0);
        contract.submit_evidence(
            "path".into(),
            "b".repeat(64),
            "https://example.test/evidence".into(),
        );
        context("v1.testnet", NOW + 13, 0);
        contract.attest("path".into(), AttestationDecision::Approve);
        context("v2.testnet", NOW + 14, 0);
        contract.attest("path".into(), AttestationDecision::Approve);
        context("keeper.testnet", NOW + 17, 0);
        contract.finalize_review("path".into());
        assert_eq!(
            contract.get_milestone_states()[0].status,
            MilestoneStatus::PayoutReady
        );
        context("builder.testnet", NOW + 18, 0);
        drop(contract.request_payout("path".into()));
        assert_eq!(contract.get_treasury().pending_outbound, U128(8 * ONE_NEAR));
        context("institution.testnet", NOW + 19, 0);
        assert!(contract.on_payout_resolved("path".into(), U128(8 * ONE_NEAR), Ok(())));
        assert_eq!(
            contract.get_milestone_states()[0].status,
            MilestoneStatus::Paid
        );
        assert_eq!(
            contract.get_treasury().confirmed_milestone_spend,
            U128(8 * ONE_NEAR)
        );
    }

    #[test]
    #[should_panic(expected = "ERR_REVIEW_WINDOW_CLOSED")]
    fn rejects_attestation_after_review_window() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 10 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 11, 0);
        contract.activate();
        context("builder.testnet", NOW + 12, 0);
        contract.submit_evidence(
            "path".into(),
            "b".repeat(64),
            "https://example.test/evidence".into(),
        );
        context("v1.testnet", NOW + 17, 0);
        contract.attest("path".into(), AttestationDecision::Approve);
    }

    #[test]
    fn failed_payout_after_expiry_does_not_block_settlement() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 10 * ONE_NEAR);
        contract.contribute();
        context("keeper.testnet", NOW + 11, 0);
        contract.activate();
        context("builder.testnet", NOW + 12, 0);
        contract.submit_evidence(
            "path".into(),
            "b".repeat(64),
            "https://example.test/evidence".into(),
        );
        context("v1.testnet", NOW + 13, 0);
        contract.attest("path".into(), AttestationDecision::Approve);
        context("v2.testnet", NOW + 14, 0);
        contract.attest("path".into(), AttestationDecision::Approve);
        context("keeper.testnet", NOW + 17, 0);
        contract.finalize_review("path".into());
        context("builder.testnet", NOW + 18, 0);
        drop(contract.request_payout("path".into()));

        context("keeper.testnet", NOW + 100, 0);
        contract.begin_settlement();
        context("institution.testnet", NOW + 101, 0);
        assert!(!contract.on_payout_resolved(
            "path".into(),
            U128(8 * ONE_NEAR),
            Err(near_sdk::PromiseError::Failed)
        ));
        assert_eq!(
            contract.get_milestone_states()[0].status,
            MilestoneStatus::ExpiredUnpaid
        );
        contract.finalize_settlement();
        assert_eq!(contract.get_status(), InstitutionStatus::Archived);
    }

    #[test]
    fn successful_settlement_freezes_proportional_residual() {
        let mut contract = init();
        context("alice.testnet", NOW + 1, 6 * ONE_NEAR);
        contract.contribute();
        context("bob.testnet", NOW + 2, 4 * ONE_NEAR);
        contract.contribute();
        contract.confirmed_milestone_spend = 5 * ONE_NEAR;
        contract.milestone_states[0].status = MilestoneStatus::Paid;
        contract.status = InstitutionStatus::Active;
        context("keeper.testnet", NOW + 20, 0);
        contract.begin_settlement();
        contract.finalize_settlement();
        assert_eq!(contract.get_status(), InstitutionStatus::Archived);
        assert_eq!(
            contract.get_claimable_refund(account("alice.testnet")),
            U128(3 * ONE_NEAR)
        );
        assert_eq!(
            contract.get_claimable_refund(account("bob.testnet")),
            U128(2 * ONE_NEAR)
        );
    }
}
