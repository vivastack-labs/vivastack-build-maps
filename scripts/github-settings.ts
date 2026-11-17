// 11.5：GitHub に反映する設定の値（T0-05。pnpm github:setup）。秘密でない値だけを書く。
// Secrets（Cloudflare の Token・Account ID）・メールアドレスはここに書かない（Secrets は gh secret set で入れる。11.2）。
// 実行は scripts/setup-github.ts、反映のロジックは scripts/lib/github-setup.ts。
// Node.js で直接読み込むので、enum などは使わない。

/** GitHub Actions の GitHub App の ID。必須のチェックを「Actions の job が出したもの」に絞る */
const GITHUB_ACTIONS_INTEGRATION_ID = 15368;

/** リポジトリの admin ロールの ID（RepositoryRole の actor_id） */
const REPOSITORY_ADMIN_ROLE_ID = 5;

/** 組織のオーナー（OrganizationAdmin）の actor_id。リポジトリの admin のロールだけで、組織のオーナーが対象になると公式に言い切れないため、両方を書く */
const ORGANIZATION_ADMIN_ACTOR_ID = 1;

/** 必須にするチェック（.github/workflows/ci.yml の job の名前。tests/unit/scripts/github-settings.test.ts が一致を確かめる） */
const REQUIRED_CHECKS = ['check', 'gitleaks'] as const;

/** ルールセットのバイパスの対象（OrganizationAdmin の actor_id は GitHub が無視する） */
type BypassActor = { actor_id: number; actor_type: string; bypass_mode: string };

/** どちらのルールセットも、リポジトリの既定のブランチ（main）だけを対象にする */
const DEFAULT_BRANCH_CONDITIONS = { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] as string[] } };

/**
 * main-ci：CI の成功を必須にする。バイパスなし（admin でも CI の失敗を無視して merge できない）。
 * PR は必須だが、承認の数は 0。strict（merge の前に main に追いつく）は無効（判断3）。
 */
const MAIN_CI_RULESET = {
  name: 'main-ci',
  target: 'branch',
  enforcement: 'active',
  conditions: DEFAULT_BRANCH_CONDITIONS,
  bypass_actors: [] as BypassActor[],
  rules: [
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 0,
        require_code_owner_review: false,
        dismiss_stale_reviews_on_push: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false
      }
    },
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: REQUIRED_CHECKS.map(context => ({ context, integration_id: GITHUB_ACTIONS_INTEGRATION_ID }))
      }
    },
    { type: 'non_fast_forward' },
    { type: 'deletion' }
  ]
};

/**
 * main-review：CODEOWNERS の承認を1件必須にし、main の更新（merge）をバイパスできる人だけに制限する。リポジトリの admin・組織のオーナーは、PR のときだけバイパスできる
 * （オーナーは1人で、自分の PR を自分で承認できないため。CI は main-ci が止める）。
 */
const MAIN_REVIEW_RULESET = {
  name: 'main-review',
  target: 'branch',
  enforcement: 'active',
  conditions: DEFAULT_BRANCH_CONDITIONS,
  bypass_actors: [
    { actor_id: REPOSITORY_ADMIN_ROLE_ID, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' },
    { actor_id: ORGANIZATION_ADMIN_ACTOR_ID, actor_type: 'OrganizationAdmin', bypass_mode: 'pull_request' }
  ],
  rules: [
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 1,
        require_code_owner_review: true,
        dismiss_stale_reviews_on_push: false,
        require_last_push_approval: false,
        required_review_thread_resolution: false
      }
    },
    // 更新の制限：バイパスできる人（admin・組織のオーナー）だけが main を更新できる。つまり merge はオーナーだけ（レビュアーの Team は承認までで、merge できない）
    // parameters は付けない：既定の update_allows_fetch_and_merge: false を、GitHub は応答で省くので、付けると比べるたびに差が出る
    { type: 'update' }
  ]
};

/** pnpm github:setup が反映する設定（11.5） */
export const GITHUB_SETTINGS = {
  owner: 'vivastack-labs',
  repo: 'vivastack-build-maps',
  requiredChecks: REQUIRED_CHECKS,
  rulesets: [MAIN_CI_RULESET, MAIN_REVIEW_RULESET],
  /** レビュアーの Team。メンバーはスクリプトで管理しない（GitHub の画面で招待する。判断4） */
  team: { slug: 'maps-reviewers', name: 'maps-reviewers', privacy: 'closed', permission: 'push' },
  /**
   * Environment は、なければ作る（PUT は作成と更新を兼ねる）。production は main だけ（承認者なし）、preview は承認制（ブランチの制限なし）。
   * preview は、Team（Write）が push したブランチの workflow で `environment: preview` を使うと CLOUDFLARE_API_TOKEN を取り出せるので、
   * デプロイの前にオーナーの承認を必須にする。承認者は login で書き、id は実行のときに `GET users/{login}` で引く。
   * 承認者・待ち時間は、どちらの Environment にも明示する（PUT が省くと既存の承認者を消しうる。設定が正）。
   */
  environments: [
    {
      name: 'production',
      deploymentBranchPolicy: { protected_branches: false, custom_branch_policies: true },
      reviewers: [] as string[],
      preventSelfReview: false,
      waitTimer: 0,
      branchPolicies: [{ name: 'main', type: 'branch' }]
    },
    {
      name: 'preview',
      deploymentBranchPolicy: null,
      reviewers: ['inspireme'],
      /** オーナーが自分の push を承認できるように、無効にする */
      preventSelfReview: false,
      waitTimer: 0,
      branchPolicies: [] as { name: string; type: string }[]
    }
  ],
  actions: {
    /**
     * Actions を有効にし、Action の SHA 固定を必須にする（今の workflow はすべて SHA で固定している。5.5）。
     * allowed_actions: 'all'（どの Action も許す）は、意図した判断：Secrets は Environment の job にしか渡らず（preview はオーナーの承認、production は main だけ）、
     * ほかの job で使う Action は Secrets に届かない。SHA の固定を必須にしてあるので、あとから中身を差し替えられる心配もない。
     * Environment の can_admins_bypass は既定（true）のまま：リポジトリの管理者はオーナーだけで、承認・ブランチの制限をオーナーが外せても問題ない。
     */
    permissions: { enabled: true, allowed_actions: 'all', sha_pinning_required: true },
    workflowPermissions: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
    /** public なので、知らない人の PR の workflow は、外部の人すべてで承認を必須にする（判断5） */
    forkPullRequestApproval: { approval_policy: 'all_external_contributors' }
  },
  /** public では無料（判断6） */
  securityAndAnalysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } }
} as const;
