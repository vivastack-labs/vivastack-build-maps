import { describe, expect, test } from 'vitest';
import { GITHUB_SETTINGS } from '../../../scripts/github-settings';
import { createGhApi, ghFailureMessage, isSubset, runGithubSetup, type GhRunner, type WriteMethod } from '../../../scripts/lib/github-setup';

const REPO = `repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`;
const TEAM = `orgs/${GITHUB_SETTINGS.owner}/teams/${GITHUB_SETTINGS.team.slug}`;
const RULESETS = `${REPO}/rulesets?includes_parents=false`;
const POLICIES = `${REPO}/environments/production/deployment-branch-policies`;
/** 本文・応答の中身を調べるための、型を付けない値 */
type Json = ReturnType<typeof JSON.parse>;
const [MAIN_CI, MAIN_REVIEW, PRODUCTION_RELEASE_TAGS] = GITHUB_SETTINGS.rulesets;

const notFound = () => new Error('gh api GET: Not Found (HTTP 404)');
type Route = unknown | Error | (() => unknown);
type Write = { readonly method: WriteMethod; readonly path: string; readonly body?: ReturnType<typeof JSON.parse> };

/**
 * GitHub が返すルールセットの形。設定を広げただけにしない：OrganizationAdmin の actor_id は null、
 * pull_request に allowed_merge_methods、required_status_checks に do_not_enforce_on_create が付き、id・source_type・_links なども付く。
 * update は parameters を付けずに返る（既定の update_allows_fetch_and_merge: false を省く。T0-05 の --apply の後に実物で確かめた）
 */
function realShape(ruleset: (typeof GITHUB_SETTINGS.rulesets)[number], id: number) {
  const rules = ruleset.rules.map(rule => {
    if ('parameters' in rule && rule.type === 'pull_request') return { ...rule, parameters: { ...rule.parameters, allowed_merge_methods: ['merge', 'squash', 'rebase'] } };
    if ('parameters' in rule && rule.type === 'required_status_checks') return { ...rule, parameters: { ...rule.parameters, do_not_enforce_on_create: false } };
    if (rule.type === 'update') return { type: 'update' };
    return rule;
  });
  return {
    id,
    name: ruleset.name,
    target: ruleset.target,
    source_type: 'Repository',
    source: `${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`,
    enforcement: ruleset.enforcement,
    conditions: ruleset.conditions,
    rules,
    bypass_actors: ruleset.bypass_actors.map(actor => (actor.actor_type === 'OrganizationAdmin' ? { ...actor, actor_id: null } : actor)),
    node_id: 'RRS_x',
    created_at: '2026-11-17T00:00:00.000+09:00',
    updated_at: '2026-11-17T00:00:00.000+09:00',
    current_user_can_bypass: 'never',
    _links: { self: { href: 'x' }, html: { href: 'y' } }
  };
}

/** オーナー承認の protection_rule（応答の形。本文の reviewers とは形が違う） */
function ownerReviewers(overrides: Record<string, unknown> = {}) {
  return { id: 2, type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 4242, login: 'vivastack' } }], ...overrides };
}

/** required_status_checks の parameters.required_status_checks を、関数で作り直す */
function mapChecks(ruleset: Json, change: (checks: Json[]) => Json[]) {
  return {
    ...ruleset,
    rules: ruleset.rules.map((rule: Json) =>
      rule.type === 'required_status_checks' ? { ...rule, parameters: { ...rule.parameters, required_status_checks: change(rule.parameters.required_status_checks) } } : rule
    )
  };
}

const PRODUCTION_BODY = {
  wait_timer: 0,
  prevent_self_review: false,
  reviewers: [{ type: 'User', id: 4242 }],
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
};
const PREVIEW_BODY = { wait_timer: 0, prevent_self_review: false, reviewers: [{ type: 'User', id: 4242 }], deployment_branch_policy: null };

/** 設定どおりに済んでいる GitHub の状態（応答には、設定にない項目も付ける）。ここから一部を変えて試す */
function configured(): Record<string, Route> {
  return {
    'GET user': { login: 'owner1' },
    [`GET ${TEAM}`]: { slug: GITHUB_SETTINGS.team.slug, privacy: 'closed', members_count: 0 },
    [`GET ${TEAM}/memberships/owner1`]: notFound(),
    [`GET ${TEAM}/repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`]: { role_name: 'write', permissions: { admin: false, maintain: false, push: true, triage: true, pull: true } },
    [`GET ${RULESETS}`]: [
      { id: 1, name: 'main-ci', enforcement: 'active' },
      { id: 2, name: 'main-review', enforcement: 'active' },
      { id: 4, name: 'production-release-tags', enforcement: 'active' }
    ],
    [`GET ${REPO}/rulesets/1`]: realShape(MAIN_CI, 1),
    [`GET ${REPO}/rulesets/2`]: realShape(MAIN_REVIEW, 2),
    [`GET ${REPO}/rulesets/4`]: realShape(PRODUCTION_RELEASE_TAGS, 4),
    'GET users/vivastack': { id: 4242, login: 'vivastack', type: 'User' },
    [`GET ${REPO}/environments/production`]: {
      name: 'production',
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ id: 1, type: 'branch_policy' }, ownerReviewers()]
    },
    [`GET ${REPO}/environments/preview`]: { name: 'preview', deployment_branch_policy: null, protection_rules: [ownerReviewers()] },
    [`GET ${POLICIES}`]: { total_count: 1, branch_policies: [{ id: 9, name: 'v*', type: 'tag' }] },
    [`GET ${REPO}/actions/permissions`]: { enabled: true, allowed_actions: 'all', sha_pinning_required: true, selected_actions_url: 'x' },
    [`GET ${REPO}/actions/permissions/workflow`]: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false },
    [`GET ${REPO}/actions/permissions/fork-pr-contributor-approval`]: { approval_policy: 'all_external_contributors' },
    [`GET ${REPO}`]: {
      name: 'x',
      delete_branch_on_merge: true,
      security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' }, advanced_security: { status: 'enabled' } }
    },
    [`GET ${REPO}/private-vulnerability-reporting`]: { enabled: true },
    [`GET ${REPO}/vulnerability-alerts`]: undefined
  };
}

/** 何も設定されていない GitHub の状態 */
function unconfigured(): Record<string, Route> {
  return {
    ...configured(),
    [`GET ${TEAM}`]: notFound(),
    [`GET ${RULESETS}`]: [],
    [`GET ${REPO}/environments/production`]: notFound(),
    [`GET ${REPO}/environments/preview`]: notFound(),
    [`GET ${POLICIES}`]: notFound(),
    [`GET ${REPO}/actions/permissions`]: { enabled: true, allowed_actions: 'all', sha_pinning_required: false },
    [`GET ${REPO}/actions/permissions/workflow`]: { default_workflow_permissions: 'write', can_approve_pull_request_reviews: true },
    [`GET ${REPO}/actions/permissions/fork-pr-contributor-approval`]: { approval_policy: 'first_time_contributors' },
    [`GET ${REPO}`]: { delete_branch_on_merge: false, security_and_analysis: { secret_scanning: { status: 'disabled' }, secret_scanning_push_protection: { status: 'disabled' } } },
    [`GET ${REPO}/private-vulnerability-reporting`]: { enabled: false },
    [`GET ${REPO}/vulnerability-alerts`]: notFound()
  };
}

/** 偽の gh api。"METHOD path" で応答を決める。決めていない GET は失敗にする */
function fake(routes: Record<string, Route>) {
  const gets: string[] = [];
  const writes: Write[] = [];
  const get = async (path: string) => {
    gets.push(path);
    const key = `GET ${path}`;
    if (!(key in routes)) throw new Error(`想定外の GET：${key}`);
    const route = routes[key];
    if (route instanceof Error) throw route;
    return typeof route === 'function' ? (route as () => unknown)() : route;
  };
  const write = async (method: WriteMethod, path: string, body?: unknown) => {
    writes.push({ method, path, ...(body === undefined ? {} : { body }) });
    const route = routes[`${method} ${path}`];
    if (route instanceof Error) throw route;
    return undefined;
  };
  return { get, write, gets, writes };
}

/** runGithubSetup を動かして、終了コードと出力を返す */
async function run(args: string[], routes: Record<string, Route>) {
  const gh = fake(routes);
  const out: string[] = [];
  const err: string[] = [];
  const code = await runGithubSetup(args, { get: gh.get, write: gh.write, writeOut: text => void out.push(text), writeErr: line => void err.push(line) });
  return { code, out: out.join('\n'), err: err.join('\n'), writes: gh.writes, gets: gh.gets };
}

const find = (writes: readonly Write[], method: string, path: string) => writes.find(call => call.method === method && call.path === path);

describe('isSubset', () => {
  test.each([
    [{ a: 1 }, { a: 1, b: 2 }, true],
    [{ a: 1 }, { a: 2 }, false],
    [{ a: { b: [1, 2] } }, { a: { b: [2, 1], c: 0 }, d: 0 }, true],
    [{ a: [1] }, { a: [1, 2] }, false],
    [{ a: [{ x: 1 }] }, { a: [{ x: 1, y: 2 }] }, true],
    [{ a: [{ x: 1 }] }, { a: [{ x: 2 }] }, false],
    [{ a: null }, { a: null }, true],
    [{ a: null }, {}, true],
    [{ a: null }, { a: { b: 1 } }, false],
    [{ a: {} }, { a: [] }, false],
    [{ a: {} }, { a: null }, false],
    [{ a: [] }, { a: {} }, false],
    [{ a: [1, 1] }, { a: [1, 2] }, false],
    [{ a: [{ x: 1 }, { x: 1 }] }, { a: [{ x: 1, y: 1 }, { x: 2 }] }, false],
    [undefined, undefined, true],
    ['x', 'x', true],
    [true, 'true', false]
  ])('11.5 isSubset(%j, %j) は %s', (want, have, expected) => {
    // Act
    const result = isSubset(want, have);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('runGithubSetup：確かめるだけ', () => {
  test('11.5 確かめるだけのとき（--apply なし）は write を呼ばず、変える予定を表示して件数を出す', async () => {
    // Act
    const result = await run([], unconfigured());

    // Assert
    expect(result.code).toBe(0);
    expect(result.writes).toEqual([]);
    expect(result.out).toContain(`[予定] POST ${REPO}/rulesets`);
    expect(result.out).toContain(`[予定] PUT ${REPO}/environments/production`);
    expect(result.out).toMatch(/\d+ 件の変更予定/u);
    expect(result.out).toContain('--apply');
  });

  test('11.5 設定のとおりに済んでいるときは、書き込みの予定がなく「変更なし」と出る（応答に余分な項目があっても）', async () => {
    // Act
    const result = await run([], configured());
    const applied = await run(['--apply'], configured());

    // Assert
    expect(result.code).toBe(0);
    expect(result.out).toContain('変更なし');
    expect(result.out).not.toContain('[予定]');
    expect(applied.writes).toEqual([]);
    expect(applied.out).toContain('変更なし');
  });

  test('11.5 --apply のとき、変える予定のものだけを書き込む', async () => {
    // Act
    const result = await run(['--apply'], unconfigured());

    // Assert
    expect(result.code).toBe(0);
    expect(result.writes.length).toBeGreaterThan(0);
    expect(result.out).toContain('[反映]');
    expect(result.out).toMatch(/\d+ 件を反映しました/u);
  });
});

describe('runGithubSetup：ルールセット', () => {
  test('11.5 ルールセットがなければ POST、同じ名前で中身が違えばその id に PUT する', async () => {
    // Arrange
    const routes = { ...configured(), [`GET ${REPO}/rulesets/1`]: { ...MAIN_CI, enforcement: 'disabled' } };

    // Act
    const created = await run(['--apply'], {
      ...configured(),
      [`GET ${RULESETS}`]: [
        { id: 1, name: 'main-ci' },
        { id: 4, name: 'production-release-tags' }
      ]
    });
    const changed = await run(['--apply'], routes);

    // Assert
    expect(created.writes.map(write => `${write.method} ${write.path}`)).toEqual([`POST ${REPO}/rulesets`]);
    expect(created.writes[0]?.body.name).toBe('main-review');
    expect(changed.writes.map(write => `${write.method} ${write.path}`)).toEqual([`PUT ${REPO}/rulesets/1`]);
  });

  test('11.5 今のルールセットが実物の形（OrganizationAdmin の actor_id が null など）で、並び順だけが違うときは書き込まない', async () => {
    // Arrange
    const real = realShape(MAIN_REVIEW, 2);
    const shuffled = { ...real, rules: [...real.rules].reverse(), bypass_actors: [...real.bypass_actors].reverse() };

    // Act
    const result = await run(['--apply'], { ...configured(), [`GET ${REPO}/rulesets/2`]: shuffled });

    // Assert
    expect(result.writes).toEqual([]);
    expect(real.bypass_actors[1]?.actor_id).toBeNull();
  });

  test('11.5 送る本文は OrganizationAdmin の actor_id を 1 のままにする（比べるときだけ外す）', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    const body = writes.find(write => write.body?.name === 'main-review')?.body;
    expect(body.bypass_actors[1]).toEqual({ actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'pull_request' });
  });

  test.each([
    ['バイパスの人が1人増えた', 2, (r: Json) => ({ ...r, bypass_actors: [...r.bypass_actors, { actor_id: 4, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }] })],
    ['bypass_mode が always', 2, (r: Json) => ({ ...r, bypass_actors: r.bypass_actors.map((a: Json) => ({ ...a, bypass_mode: 'always' })) })],
    ['バイパスの人が main-ci に付いた', 1, (r: Json) => ({ ...r, bypass_actors: [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }] })],
    ['必須のチェックの integration_id が違う', 1, (r: Json) => mapChecks(r, checks => checks.map((c: Json) => ({ ...c, integration_id: 1 })))],
    ['必須のチェックが1つ増えた', 1, (r: Json) => mapChecks(r, checks => [...checks, { context: 'extra', integration_id: 15368 }])],
    ['main-ci から deletion が欠けた', 1, (r: Json) => ({ ...r, rules: r.rules.filter((x: Json) => x.type !== 'deletion') })],
    ['main-ci から non_fast_forward が欠けた', 1, (r: Json) => ({ ...r, rules: r.rules.filter((x: Json) => x.type !== 'non_fast_forward') })],
    ['main-review から update が欠けた', 2, (r: Json) => ({ ...r, rules: r.rules.filter((x: Json) => x.type !== 'update') })],
    [
      'main-review の承認の数が 0',
      2,
      (r: Json) => ({ ...r, rules: r.rules.map((x: Json) => (x.type === 'pull_request' ? { ...x, parameters: { ...x.parameters, required_approving_review_count: 0 } } : x)) })
    ],
    ['enforcement が evaluate', 1, (r: Json) => ({ ...r, enforcement: 'evaluate' })]
  ])('11.5 ルールセットの保護が弱くなった（%s）ときは PUT する', async (_name, id, weaken) => {
    // Arrange
    const current = weaken(realShape(GITHUB_SETTINGS.rulesets[id - 1]!, id));

    // Act
    const { writes } = await run(['--apply'], { ...configured(), [`GET ${REPO}/rulesets/${id}`]: current });

    // Assert
    expect(writes.map(write => `${write.method} ${write.path}`)).toEqual([`PUT ${REPO}/rulesets/${id}`]);
  });

  test('11.5 main-ci はバイパスなしで、check・gitleaks を GitHub Actions のチェックとして必須にする', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    const body = writes.find(write => write.body?.name === 'main-ci')?.body;
    expect(body.target).toBe('branch');
    expect(body.enforcement).toBe('active');
    expect(body.conditions).toEqual({ ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } });
    expect(body.bypass_actors).toEqual([]);
    expect(body.rules.map((rule: { type: string }) => rule.type).sort()).toEqual(['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']);
    const checks = body.rules.find((rule: { type: string }) => rule.type === 'required_status_checks').parameters;
    expect(checks.strict_required_status_checks_policy).toBe(false);
    expect(checks.required_status_checks).toEqual([
      { context: 'check', integration_id: 15368 },
      { context: 'gitleaks', integration_id: 15368 }
    ]);
    const review = body.rules.find((rule: { type: string }) => rule.type === 'pull_request').parameters;
    expect(review.required_approving_review_count).toBe(0);
    expect(review.require_code_owner_review).toBe(false);
  });

  test('11.5 main-review は CODEOWNERS の承認を必須にし、dismiss stale・last push approval を無効にし、admin・組織のオーナーだけが PR でバイパスできる', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    const body = writes.find(write => write.body?.name === 'main-review')?.body;
    expect(body.enforcement).toBe('active');
    expect(body.conditions).toEqual({ ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } });
    expect(body.rules.map((rule: { type: string }) => rule.type)).toEqual(['pull_request', 'update']);
    expect(body.rules[1]).toEqual({ type: 'update' });
    expect(body.rules[0].parameters).toEqual({
      required_approving_review_count: 1,
      require_code_owner_review: true,
      dismiss_stale_reviews_on_push: false,
      require_last_push_approval: false,
      required_review_thread_resolution: false
    });
    expect(body.bypass_actors).toEqual([
      { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' },
      { actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'pull_request' }
    ]);
  });

  test('11.5 設定にないルールセットは触らず、名前と enforcement を警告として出す', async () => {
    // Arrange
    const routes = { ...configured(), [`GET ${RULESETS}`]: [...(configured()[`GET ${RULESETS}`] as unknown[]), { id: 3, name: 'default', enforcement: 'disabled' }] };

    // Act
    const result = await run(['--apply'], routes);

    // Assert
    expect(result.err).toContain('[警告]');
    expect(result.err).toContain('default');
    expect(result.err).toContain('disabled');
    expect(result.writes).toEqual([]);
    expect(result.gets.some(path => path.endsWith('/rulesets/3'))).toBe(false);
  });
});

describe('runGithubSetup：Environment', () => {
  test('11.5 production は v* タグだけを許可し、設定済みなら足さない', async () => {
    // Act
    const missing = await run(['--apply'], { ...configured(), [`GET ${POLICIES}`]: { total_count: 0, branch_policies: [] } });
    const present = await run(['--apply'], configured());

    // Assert
    expect(missing.writes).toEqual([{ method: 'POST', path: POLICIES, body: { name: 'v*', type: 'tag' } }]);
    expect(present.writes).toEqual([]);
  });

  test('11.5 production がなければ作り（PUT）、そのあとに v* タグを許可する', async () => {
    // Act
    const { writes } = await run(['--apply'], { ...configured(), [`GET ${REPO}/environments/production`]: notFound(), [`GET ${POLICIES}`]: notFound() });

    // Assert
    expect(writes).toEqual([
      { method: 'PUT', path: `${REPO}/environments/production`, body: PRODUCTION_BODY },
      { method: 'POST', path: POLICIES, body: { name: 'v*', type: 'tag' } }
    ]);
  });

  test('11.5 production を v* タグに移行し、main と不要な ref の許可を消す', async () => {
    // Arrange
    const policies = {
      total_count: 3,
      branch_policies: [
        { id: 9, name: 'main', type: 'branch' },
        { id: 10, name: 'dev', type: 'branch' },
        { id: 11, name: 'main', type: 'tag' }
      ]
    };

    // Act
    const routes = {
      ...configured(),
      [`GET ${POLICIES}`]: policies,
      [`GET ${REPO}/environments/production`]: { deployment_branch_policy: PRODUCTION_BODY.deployment_branch_policy, protection_rules: [] }
    };
    const check = await run([], routes);
    const { writes } = await run(['--apply'], routes);

    // Assert
    expect(writes).toEqual([
      { method: 'PUT', path: `${REPO}/environments/production`, body: PRODUCTION_BODY },
      { method: 'POST', path: POLICIES, body: { name: 'v*', type: 'tag' } },
      { method: 'DELETE', path: `${POLICIES}/9` },
      { method: 'DELETE', path: `${POLICIES}/10` },
      { method: 'DELETE', path: `${POLICIES}/11` }
    ]);
    expect(check.out).toContain(`[予定] DELETE ${POLICIES}/10`);
  });

  test('11.5 preview は承認制：承認者がいなければ PUT の予定。users/{login} の id を使う（ブランチの制限なし・ポリシーの一覧は見ない）', async () => {
    // Arrange
    const noReviewers = { ...configured(), [`GET ${REPO}/environments/preview`]: { deployment_branch_policy: null, protection_rules: [] } };

    // Act
    const check = await run([], noReviewers);
    const { writes, gets } = await run(['--apply'], noReviewers);

    // Assert
    expect(gets).toContain('users/vivastack');
    expect(writes).toEqual([{ method: 'PUT', path: `${REPO}/environments/preview`, body: PREVIEW_BODY }]);
    expect(check.out).toContain(`[予定] PUT ${REPO}/environments/preview`);
    expect(check.writes).toEqual([]);
    expect(gets.some(path => path.includes('/environments/preview/deployment-branch-policies'))).toBe(false);
  });

  test('11.5 preview に設定の承認者がいれば変更なし（応答に余分な項目があっても）', async () => {
    // Act
    const { writes } = await run(['--apply'], configured());

    // Assert
    expect(writes).toEqual([]);
  });

  test.each([
    ['別の人が承認者', ownerReviewers({ reviewers: [{ type: 'User', reviewer: { id: 1, login: 'other' } }] })],
    [
      '承認者が増えている',
      ownerReviewers({
        reviewers: [
          { type: 'User', reviewer: { id: 4242 } },
          { type: 'User', reviewer: { id: 1 } }
        ]
      })
    ],
    ['Team が承認者', ownerReviewers({ reviewers: [{ type: 'Team', reviewer: { id: 4242 } }] })],
    ['自分の承認の禁止が有効', ownerReviewers({ prevent_self_review: true })]
  ])('11.5 preview の承認者が設定と違う（%s）ときは PUT する', async (_name, rule) => {
    // Act
    const { writes } = await run(['--apply'], { ...configured(), [`GET ${REPO}/environments/preview`]: { deployment_branch_policy: null, protection_rules: [rule] } });

    // Assert
    expect(writes).toEqual([{ method: 'PUT', path: `${REPO}/environments/preview`, body: PREVIEW_BODY }]);
  });

  test('11.5 待ち時間が設定と違えば PUT する。production の承認者はオーナーに揃える', async () => {
    // Arrange
    const waiting = { deployment_branch_policy: null, protection_rules: [ownerReviewers(), { type: 'wait_timer', wait_timer: 5 }] };
    const production = {
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
      protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 1 } }] }]
    };

    // Act
    const wait = await run(['--apply'], { ...configured(), [`GET ${REPO}/environments/preview`]: waiting });
    const external = await run(['--apply'], { ...configured(), [`GET ${REPO}/environments/production`]: production });

    // Assert
    expect(wait.writes).toEqual([{ method: 'PUT', path: `${REPO}/environments/preview`, body: PREVIEW_BODY }]);
    expect(external.writes).toEqual([{ method: 'PUT', path: `${REPO}/environments/production`, body: PRODUCTION_BODY }]);
  });

  test.each([
    ['users/{login} に id がない', 'GET users/vivastack', { login: 'vivastack' }, 'id'],
    ['protection_rules が配列でない', `GET ${REPO}/environments/preview`, { deployment_branch_policy: null, protection_rules: {} }, 'protection_rules']
  ])('11.5 応答の形が違う（%s）ときは終了コード 1', async (_name, key, value, message) => {
    // Act
    const result = await run([], { ...configured(), [key]: value });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain(message);
  });

  test('11.5 ブランチの一覧の取得が 404 以外で失敗したら、誤りにする', async () => {
    // Act
    const result = await run([], { ...configured(), [`GET ${POLICIES}`]: new Error('Server Error (HTTP 500)') });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('Environment');
  });
});

describe('runGithubSetup：Team', () => {
  test('11.5 Team がなければ作り、実行者をメンバーから外し、Write を付ける', async () => {
    // Act
    const { code, writes } = await run(['--apply'], { ...configured(), [`GET ${TEAM}`]: notFound() });

    // Assert
    expect(code).toBe(0);
    expect(writes).toEqual([
      { method: 'POST', path: `orgs/${GITHUB_SETTINGS.owner}/teams`, body: { name: 'maps-reviewers', privacy: 'closed' } },
      { method: 'DELETE', path: `${TEAM}/memberships/owner1` },
      { method: 'PUT', path: `${TEAM}/repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`, body: { permission: 'push' } }
    ]);
  });

  test('11.5 Team がすでにあって、実行者がメンバーなら外す。メンバーでなければ何もしない', async () => {
    // Act
    const member = await run(['--apply'], { ...configured(), [`GET ${TEAM}/memberships/owner1`]: { state: 'active', role: 'maintainer' } });
    const checked = await run([], { ...configured(), [`GET ${TEAM}/memberships/owner1`]: { state: 'active', role: 'maintainer' } });
    const notMember = await run(['--apply'], configured());

    // Assert
    expect(member.writes).toEqual([{ method: 'DELETE', path: `${TEAM}/memberships/owner1` }]);
    expect(checked.out).toContain(`[予定] DELETE ${TEAM}/memberships/owner1`);
    expect(checked.writes).toEqual([]);
    expect(notMember.writes).toEqual([]);
  });

  test('11.5 すでにある Team の privacy が closed でなければ PATCH する', async () => {
    // Act
    const { writes } = await run(['--apply'], { ...configured(), [`GET ${TEAM}`]: { slug: 'maps-reviewers', privacy: 'secret' } });

    // Assert
    expect(writes).toEqual([{ method: 'PATCH', path: TEAM, body: { privacy: 'closed' } }]);
  });

  test('11.5 Team にリポジトリの Write が付いていなければ付ける。Write なら付けない', async () => {
    // Arrange
    const permissionPath = `${TEAM}/repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`;

    // Act
    const read = await run(['--apply'], { ...configured(), [`GET ${permissionPath}`]: { permissions: { admin: false, maintain: false, push: false, pull: true } } });
    const none = await run(['--apply'], { ...configured(), [`GET ${permissionPath}`]: notFound() });
    const admin = await run(['--apply'], { ...configured(), [`GET ${permissionPath}`]: { permissions: { admin: true, maintain: true, push: true } } });
    const write = await run(['--apply'], configured());

    // Assert
    expect(read.writes).toEqual([{ method: 'PUT', path: permissionPath, body: { permission: 'push' } }]);
    expect(none.writes).toEqual([{ method: 'PUT', path: permissionPath, body: { permission: 'push' } }]);
    expect(admin.writes).toEqual([{ method: 'PUT', path: permissionPath, body: { permission: 'push' } }]);
    expect(write.writes).toEqual([]);
  });
});

describe('runGithubSetup：Actions・セキュリティ', () => {
  test('11.5 Actions の有効・SHA 固定・権限・fork の PR の承認を設定する', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    expect(find(writes, 'PUT', `${REPO}/actions/permissions`)?.body).toEqual({ enabled: true, allowed_actions: 'all', sha_pinning_required: true });
    expect(find(writes, 'PUT', `${REPO}/actions/permissions/workflow`)?.body).toEqual({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: false });
    expect(find(writes, 'PUT', `${REPO}/actions/permissions/fork-pr-contributor-approval`)?.body).toEqual({ approval_policy: 'all_external_contributors' });
  });

  test('11.5 merge した PR のブランチを自動で消す設定（delete_branch_on_merge）を有効にする', async () => {
    // Act
    const off = await run(['--apply'], unconfigured());
    const on = await run(['--apply'], configured());

    // Assert：無効なら PATCH で有効にし、有効なら書き込まない
    const patches = off.writes.filter(write => write.method === 'PATCH' && write.path === REPO);
    expect(patches).toContainEqual({ method: 'PATCH', path: REPO, body: { delete_branch_on_merge: true } });
    expect(on.writes).toEqual([]);
  });

  test('11.5 Secret scanning・push protection・脆弱性の非公開の報告・Dependabot alerts を有効にする（本文なしの PUT）', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    expect(writes.filter(write => write.method === 'PATCH' && write.path === REPO).map(write => write.body)).toContainEqual({
      security_and_analysis: { secret_scanning: { status: 'enabled' }, secret_scanning_push_protection: { status: 'enabled' } }
    });
    expect(find(writes, 'PUT', `${REPO}/private-vulnerability-reporting`)).toEqual({ method: 'PUT', path: `${REPO}/private-vulnerability-reporting` });
    expect(find(writes, 'PUT', `${REPO}/vulnerability-alerts`)).toEqual({ method: 'PUT', path: `${REPO}/vulnerability-alerts` });
  });

  test('11.5 vulnerability-alerts は、204（本文なし）なら有効として書き込まず、404 なら有効にする。ほかの失敗は誤り', async () => {
    // Act
    const enabled = await run(['--apply'], configured());
    const disabled = await run(['--apply'], { ...configured(), [`GET ${REPO}/vulnerability-alerts`]: notFound() });
    const broken = await run([], { ...configured(), [`GET ${REPO}/vulnerability-alerts`]: new Error('Server Error (HTTP 500)') });

    // Assert
    expect(enabled.writes).toEqual([]);
    expect(disabled.writes).toEqual([{ method: 'PUT', path: `${REPO}/vulnerability-alerts` }]);
    expect(broken.code).toBe(1);
  });
});

describe('runGithubSetup：順番・表示', () => {
  test.each([403, 500])('11.5 タグ保護への書き込みが HTTP %i で失敗するとタグを許可しない', async status => {
    const routes = {
      ...configured(),
      [`GET ${RULESETS}`]: (configured()[`GET ${RULESETS}`] as { id: number }[]).filter(ruleset => ruleset.id !== 4),
      [`GET ${POLICIES}`]: { branch_policies: [{ id: 9, name: 'main', type: 'branch' }] },
      [`POST ${REPO}/rulesets`]: new Error(`HTTP ${status}`)
    };
    const result = await run(['--apply'], routes);

    expect(result.code).toBe(1);
    expect(result.err).toContain(`HTTP ${status}`);
    expect(result.writes.some(write => write.path === POLICIES)).toBe(false);
  });

  test('11.5 production の承認設定に失敗すると許可する ref を変更しない', async () => {
    const productionPath = `${REPO}/environments/production`;
    const result = await run(['--apply'], {
      ...configured(),
      [`GET ${productionPath}`]: { deployment_branch_policy: PRODUCTION_BODY.deployment_branch_policy, protection_rules: [] },
      [`GET ${POLICIES}`]: { branch_policies: [{ id: 9, name: 'main', type: 'branch' }] },
      [`PUT ${productionPath}`]: new Error('HTTP 403')
    });

    expect(result.code).toBe(1);
    expect(result.writes).toEqual([{ method: 'PUT', path: productionPath, body: PRODUCTION_BODY }]);
  });

  test('11.5 ルールセット → Environment（preview の承認）→ Team → Actions → セキュリティの順に書き込む', async () => {
    // Act
    const { writes } = await run(['--apply'], unconfigured());

    // Assert
    const order = (predicate: (path: string) => boolean) => writes.findIndex(write => predicate(write.path));
    const positions = [
      writes.findIndex(write => write.body?.name === 'production-release-tags'),
      order(path => path === POLICIES),
      order(path => path.includes('/environments/preview')),
      order(path => path.startsWith('orgs/')),
      order(path => path.includes('/actions/permissions')),
      order(path => path.includes('vulnerability'))
    ];
    expect(positions.every(position => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('11.5 予定の表示に、preview の承認者の login と id を出す', async () => {
    // Act
    const { out } = await run([], unconfigured());

    // Assert
    expect(out).toContain('vivastack（id 4242）');
  });
});

describe('ghFailureMessage', () => {
  test.each([
    [{ message: 'Command failed', killed: true, signal: 'SIGTERM' }, '60 秒で終わらなかった'],
    [{ message: 'Command failed', killed: false, signal: 'SIGKILL' }, '60 秒で終わらなかった']
  ])('11.5 タイムアウトで止めたとき（%j）は、そう分かる文にする', (error, expected) => {
    // Act
    const message = ghFailureMessage(error, { stderr: '', stdout: '' }, 60_000);

    // Assert
    expect(message).toContain(expected);
  });

  test('11.5 それ以外は、標準エラーと標準出力の内容を使い、空ならエラーの message を使う', () => {
    // Act
    const withOutput = ghFailureMessage({ message: 'Command failed', killed: false, signal: null }, { stderr: 'gh: Not Found (HTTP 404)\n', stdout: '{"status":"404"}\n' }, 60_000);
    const empty = ghFailureMessage({ message: 'Command failed' }, { stderr: '', stdout: '' }, 60_000);

    // Assert
    expect(withOutput).toBe('gh: Not Found (HTTP 404)\n{"status":"404"}');
    expect(empty).toBe('Command failed');
  });
});

describe('runGithubSetup：誤り', () => {
  test('11.5 API の誤り（403 など）はメッセージを出して終了コード 1。計画の途中で失敗したら、何も書き込まない', async () => {
    // Act
    const result = await run(['--apply'], { ...unconfigured(), [`GET ${REPO}/environments/production`]: new Error('gh: Resource not accessible (HTTP 403)') });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('HTTP 403');
    expect(result.err).not.toContain('gh auth refresh');
    expect(result.writes).toEqual([]);
  });

  test('11.5 admin:org が足りないときは gh auth refresh の案内を出す', async () => {
    // Act
    const result = await run([], { ...configured(), [`GET ${TEAM}`]: new Error('gh: Must have admin rights to Repository. (HTTP 403)') });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('gh auth refresh -h github.com -s admin:org');
  });

  test('11.5 書き込みが失敗したら、そこで止めて終了コード 1（あとの書き込みは送らない）', async () => {
    // Act
    const result = await run(['--apply'], { ...unconfigured(), [`PUT ${TEAM}/repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`]: new Error('Forbidden (HTTP 403)') });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('反映で止まりました');
    expect(result.writes.at(-1)?.path).toBe(`${TEAM}/repos/${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.repo}`);
  });

  test('11.5 Error でないものが投げられても、終了コード 1 にする', async () => {
    // Act
    const result = await run([], { ...configured(), [`GET ${RULESETS}`]: () => Promise.reject('文字列') });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('文字列');
  });

  test.each([
    ['ルールセットの一覧が配列でない', `GET ${RULESETS}`, { message: 'x' }, 'ルールセットの一覧'],
    ['ルールセットの一覧の要素がオブジェクトでない', `GET ${RULESETS}`, ['x'], 'ルールセットの一覧の要素'],
    ['ルールセットの中身が null', `GET ${REPO}/rulesets/1`, null, 'main-ci'],
    ['ブランチの一覧がオブジェクトでない', `GET ${POLICIES}`, [], 'デプロイできるブランチの一覧'],
    ['branch_policies が配列でない', `GET ${POLICIES}`, { branch_policies: {} }, 'branch_policies'],
    ['GET user に login がない', 'GET user', {}, 'login'],
    ['GET user がオブジェクトでない', 'GET user', 'x', 'GET user']
  ])('11.5 応答の形が違う（%s）ときは、分かりやすいメッセージで終了コード 1', async (_name, key, value, message) => {
    // Act
    const result = await run([], { ...configured(), [key]: value });

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain(message);
  });

  test.each([['--unknown'], ['--apply', 'extra'], ['apply']])('11.5 知らない引数 %s は終了コード 1（何も送らない）', async (...args) => {
    // Act
    const result = await run(args, configured());

    // Assert
    expect(result.code).toBe(1);
    expect(result.err).toContain('使い方');
    expect(result.gets).toEqual([]);
    expect(result.writes).toEqual([]);
  });
});

describe('createGhApi', () => {
  /** 呼ばれた引数・標準入力を記録する偽の gh */
  function recorder(stdout = '') {
    const runs: { args: readonly string[]; input: string | undefined }[] = [];
    const runner: GhRunner = async (args, input) => {
      runs.push({ args, input });
      return stdout;
    };
    return { runner, runs };
  }

  test('11.5 本文は標準入力で渡し、シェルを通さない引数で gh api を呼ぶ', async () => {
    // Arrange
    const { runner, runs } = recorder('{"id":1}');

    // Act
    const result = await createGhApi(runner).write('PUT', 'repos/o/r/rulesets/1', { name: 'a b; rm -rf' });

    // Assert
    expect(result).toEqual({ id: 1 });
    expect(runs[0]).toEqual({ args: ['api', '-X', 'PUT', 'repos/o/r/rulesets/1', '--input', '-'], input: '{"name":"a b; rm -rf"}' });
  });

  test('11.5 本文のない書き込みは --input を付けない', async () => {
    // Arrange
    const { runner, runs } = recorder('');

    // Act
    const result = await createGhApi(runner).write('PUT', 'repos/o/r/vulnerability-alerts');

    // Assert
    expect(result).toBeUndefined();
    expect(runs[0]).toEqual({ args: ['api', '-X', 'PUT', 'repos/o/r/vulnerability-alerts'], input: undefined });
  });

  test('11.5 GET は --input を付けず、空の応答（204）は undefined。accept を渡すと Accept ヘッダーを付ける', async () => {
    // Arrange
    const { runner, runs } = recorder('');

    // Act
    const plain = await createGhApi(runner).get('user');
    await createGhApi(runner).get('orgs/x/teams/y/repos/o/r', 'application/vnd.github.v3.repository+json');

    // Assert
    expect(plain).toBeUndefined();
    expect(runs[0]).toEqual({ args: ['api', '-X', 'GET', 'user'], input: undefined });
    expect(runs[1]?.args).toEqual(['api', '-X', 'GET', '-H', 'Accept: application/vnd.github.v3.repository+json', 'orgs/x/teams/y/repos/o/r']);
  });

  test('11.5 gh の失敗は、標準エラーの内容を含めたエラーにする', async () => {
    // Arrange
    const failing: GhRunner = async () => {
      throw new Error('gh: Not Found (HTTP 404)');
    };

    // Act
    const promise = createGhApi(failing).get('orgs/x/teams/y');

    // Assert
    await expect(promise).rejects.toThrow(/GET orgs\/x\/teams\/y.*HTTP 404/su);
  });

  test('11.5 JSON でない応答はエラーにする', async () => {
    // Arrange
    const { runner } = recorder('<html>');

    // Act
    const promise = createGhApi(runner).get('user');

    // Assert
    await expect(promise).rejects.toThrow(/JSON/u);
  });
});
