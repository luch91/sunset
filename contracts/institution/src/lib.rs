use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LookupMap;
use near_sdk::json_types::{U64, U128};
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, env, near, require};
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
}

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
    contributor_count: u32,
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

        Self {
            charter,
            status: InstitutionStatus::Funding,
            total_received: 0,
            confirmed_milestone_spend: 0,
            pending_outbound: 0,
            confirmed_refunds: 0,
            storage_reserve,
            contributions: LookupMap::new(StorageKey::Contributions),
            contributor_count: 0,
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

    fn refresh_deadline_guards(&mut self) {
        if self.status == InstitutionStatus::Funding
            && env::block_timestamp() >= self.charter.expires_at_ns.0
        {
            self.status = InstitutionStatus::FundingFailed;
        }
    }
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
    use near_sdk::{NearToken, testing_env};

    const NOW: u64 = 1_800_000_000_000_000_000;
    const ONE_NEAR: u128 = 10u128.pow(24);

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, timestamp: u64, deposit: u128) {
        let mut builder = VMContextBuilder::new();
        builder
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
}
