use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::{UnorderedMap, UnorderedSet};
use near_sdk::json_types::{U64, U128};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue, env, near, require,
};
use serde::{Deserialize, Serialize};

const INSTITUTION_WASM: &[u8] =
    include_bytes!("../../../target/wasm32-unknown-unknown/release/sunset_institution.wasm");
const MIN_CREATION_DEPOSIT: u128 = 3 * 10u128.pow(24);
const FACTORY_STORAGE_FEE: u128 = 400_000_000_000_000_000_000_000;
const INIT_GAS: Gas = Gas::from_tgas(40);
const CALLBACK_GAS: Gas = Gas::from_tgas(15);

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Institutions,
    Pending,
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
pub enum RefundPolicy {
    ProRataContributors,
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
#[derive(Clone)]
pub struct InstitutionRecord {
    pub account_id: AccountId,
    pub founder: AccountId,
    pub charter_hash: String,
    pub created_at_ns: U64,
    pub code_hash: String,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct InitArgs {
    charter: InstitutionCharter,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    institutions: UnorderedMap<AccountId, InstitutionRecord>,
    pending: UnorderedSet<AccountId>,
    institution_code_hash: String,
}

#[near]
impl Factory {
    #[init]
    pub fn init() -> Self {
        require!(!env::state_exists(), "ERR_ALREADY_INITIALIZED");
        Self {
            institutions: UnorderedMap::new(StorageKey::Institutions),
            pending: UnorderedSet::new(StorageKey::Pending),
            institution_code_hash: hex_sha256(INSTITUTION_WASM),
        }
    }

    #[payable]
    pub fn create_institution(
        &mut self,
        charter: InstitutionCharter,
        metadata_hash: String,
    ) -> Promise {
        require!(
            env::signer_account_id() == charter.founder,
            "ERR_FOUNDER_SIGNATURE_REQUIRED"
        );
        require!(
            metadata_hash == charter.charter_hash,
            "ERR_METADATA_HASH_MISMATCH"
        );
        require!(
            env::attached_deposit().as_yoctonear() >= MIN_CREATION_DEPOSIT,
            "ERR_CREATION_DEPOSIT_TOO_SMALL"
        );
        require!(is_valid_label(&charter.id), "ERR_INVALID_INSTITUTION_ID");

        let child: AccountId = format!("{}.{}", charter.id, env::current_account_id())
            .parse()
            .expect("ERR_INVALID_CHILD_ACCOUNT");
        require!(
            self.institutions.get(&child).is_none(),
            "ERR_INSTITUTION_EXISTS"
        );
        require!(!self.pending.contains(&child), "ERR_INSTITUTION_PENDING");
        self.pending.insert(&child);

        let reserve = env::attached_deposit()
            .as_yoctonear()
            .checked_sub(FACTORY_STORAGE_FEE)
            .expect("ERR_CREATION_DEPOSIT_TOO_SMALL");
        let args = near_sdk::serde_json::to_vec(&InitArgs {
            charter: charter.clone(),
        })
        .expect("ERR_SERIALIZE_CHARTER");
        let callback_args = near_sdk::serde_json::to_vec(&CallbackArgs {
            account_id: child.clone(),
            founder: charter.founder,
            charter_hash: charter.charter_hash,
            refund_amount: U128(reserve),
        })
        .expect("ERR_SERIALIZE_CALLBACK");

        Promise::new(child.clone())
            .create_account()
            .deploy_contract(INSTITUTION_WASM.to_vec())
            .function_call("init", args, NearToken::from_yoctonear(reserve), INIT_GAS)
            .then(Promise::new(env::current_account_id()).function_call(
                "on_create_institution",
                callback_args,
                NearToken::from_yoctonear(0),
                CALLBACK_GAS,
            ))
    }

    #[private]
    pub fn on_create_institution(
        &mut self,
        account_id: AccountId,
        founder: AccountId,
        charter_hash: String,
        #[callback_result] result: Result<(), PromiseError>,
        refund_amount: U128,
    ) -> PromiseOrValue<bool> {
        require!(
            self.pending.remove(&account_id),
            "ERR_UNKNOWN_PENDING_INSTITUTION"
        );
        if result.is_err() {
            return PromiseOrValue::Promise(
                Promise::new(founder).transfer(NearToken::from_yoctonear(refund_amount.0)),
            );
        }
        let record = InstitutionRecord {
            account_id: account_id.clone(),
            founder,
            charter_hash,
            created_at_ns: U64(env::block_timestamp()),
            code_hash: self.institution_code_hash.clone(),
        };
        self.institutions.insert(&account_id, &record);
        PromiseOrValue::Value(true)
    }

    pub fn get_institution(&self, account_id: AccountId) -> Option<InstitutionRecord> {
        self.institutions.get(&account_id)
    }

    pub fn list_institutions(
        &self,
        from_index: Option<u32>,
        limit: Option<u32>,
    ) -> Vec<InstitutionRecord> {
        let start = from_index.unwrap_or(0) as usize;
        let count = limit.unwrap_or(20).min(50) as usize;
        self.institutions
            .values_as_vector()
            .iter()
            .skip(start)
            .take(count)
            .collect()
    }

    pub fn get_supported_code_hashes(&self) -> Vec<String> {
        vec![self.institution_code_hash.clone()]
    }
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct CallbackArgs {
    account_id: AccountId,
    founder: AccountId,
    charter_hash: String,
    refund_amount: U128,
}

fn is_valid_label(value: &str) -> bool {
    (2..=40).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && !value.starts_with('-')
        && !value.ends_with('-')
}

fn hex_sha256(value: &[u8]) -> String {
    env::sha256(value)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str, signer: &str, deposit: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("factory.testnet"))
            .predecessor_account_id(account(predecessor))
            .signer_account_id(account(signer))
            .attached_deposit(NearToken::from_yoctonear(deposit));
        testing_env!(builder.build());
    }

    fn charter() -> InstitutionCharter {
        InstitutionCharter {
            id: "garden".into(),
            founder: account("founder.testnet"),
            name: "Garden".into(),
            mission_summary: "Repair a garden".into(),
            charter_hash: "a".repeat(64),
            metadata_uri: "".into(),
            funding_deadline_ns: U64(2_000_000_000_000_000_000),
            expires_at_ns: U64(2_000_100_000_000_000_000),
            settlement_grace_ns: U64(1),
            minimum_funding: U128(1),
            funding_cap: U128(2),
            verifiers: vec![
                account("v1.testnet"),
                account("v2.testnet"),
                account("v3.testnet"),
            ],
            verifier_threshold: 2,
            milestones: vec![],
            refund_policy: RefundPolicy::ProRataContributors,
            code_version: "0.1.0".into(),
        }
    }

    #[test]
    fn creates_pending_child_without_access_key_action() {
        context("founder.testnet", "founder.testnet", MIN_CREATION_DEPOSIT);
        let mut factory = Factory::init();
        let promise = factory.create_institution(charter(), "a".repeat(64));
        drop(promise);
        assert!(factory.pending.contains(&account("garden.factory.testnet")));
    }

    #[test]
    #[should_panic(expected = "ERR_FOUNDER_SIGNATURE_REQUIRED")]
    fn rejects_non_founder_signer() {
        context("attacker.testnet", "attacker.testnet", MIN_CREATION_DEPOSIT);
        let mut factory = Factory::init();
        let _ = factory.create_institution(charter(), "a".repeat(64));
    }

    #[test]
    fn validates_child_labels() {
        assert!(is_valid_label("garden-2"));
        assert!(!is_valid_label("Garden"));
        assert!(!is_valid_label("-garden"));
    }
}
