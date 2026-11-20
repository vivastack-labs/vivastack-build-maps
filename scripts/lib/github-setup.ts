// 11.5：GitHub の設定（ルールセット・Environment・Team・Actions・セキュリティ）を gh api で反映する（T0-05。pnpm github:setup）。
// 先に今の状態を GET で集め、設定と比べて「変える必要があるもの」だけの一覧を作る（計画）。確認モードは一覧を表示するだけで、
// --apply のときだけ一覧を順に書き込む。計画を作る関数は get しか受け取らないので、確認モードでは書き込めない。何度実行しても結果は同じ。
// gh api の呼び出しと出力は引数で受け取る（テストでは本物の GitHub に繋がない）。Secrets は扱わない。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import { GITHUB_SETTINGS } from '../github-settings.ts';

/** 書き込みのメソッド */
export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** gh api で GET して、応答の JSON を返す（本文なしの応答〔204〕は undefined）。404 などの失敗は例外。accept を渡すと Accept ヘッダーを付ける */
export type GhGet = (path: string, accept?: string) => Promise<unknown>;

/** gh api で書き込む。body は JSON にして標準入力で渡す（なければ本文なし）。応答の JSON（なければ undefined）を返す。失敗は例外 */
export type GhWrite = (method: WriteMethod, path: string, body?: unknown) => Promise<unknown>;

/** `gh` を引数つきで動かし、標準出力を返す。失敗（終了コード≠0）は、標準エラーの内容をメッセージにした例外にする */
export type GhRunner = (args: readonly string[], input: string | undefined) => Promise<string>;

/**
 * gh を動かす関数から、get・write を作る。本文は標準入力（`--input -`）で渡し、シェルを通さない。
 * 失敗は、リクエストと gh の標準エラーの内容を含めたエラーにする。
 */
export function createGhApi(run: GhRunner): { readonly get: GhGet; readonly write: GhWrite } {
  const call = async (method: string, path: string, options: { readonly accept?: string; readonly body?: unknown }): Promise<unknown> => {
    const { accept, body } = options;
    const args = ['api', '-X', method, ...(accept === undefined ? [] : ['-H', `Accept: ${accept}`]), path, ...(body === undefined ? [] : ['--input', '-'])];
    let stdout: string;
    try {
      stdout = await run(args, body === undefined ? undefined : JSON.stringify(body));
    } catch (error) {
      throw new Error(`gh api ${method} ${path} が失敗しました：${errorMessage(error)}`, { cause: error });
    }
    if (stdout.trim() === '') return undefined;
    try {
      return JSON.parse(stdout) as unknown;
    } catch {
      throw new Error(`gh api ${method} ${path} の応答が JSON ではありません`);
    }
  };
  return {
    get: (path, accept) => call('GET', path, { accept }),
    write: (method, path, body) => call(method, path, { body })
  };
}

/**
 * want の項目がすべて have に含まれているか（GitHub の応答には、設定していない項目も付くため、want のキーだけを比べる）。
 * オブジェクトは再帰。配列は長さが同じで、want の各要素が have の別々の要素に1対1で対応すること
 * （順序は問わない。GitHub が並べ替えても差と見なさない。一致した have の要素は、次の候補から外す）。
 * null は have が null か項目なしなら一致。そのほかは ===。
 */
export function isSubset(want: unknown, have: unknown): boolean {
  if (want === null) return have === null || have === undefined;
  if (Array.isArray(want)) return Array.isArray(have) && want.length === have.length && matchesOneToOne(want, have);
  if (typeof want === 'object') {
    if (typeof have !== 'object' || have === null || Array.isArray(have)) return false;
    return Object.entries(want).every(([key, value]) => isSubset(value, (have as Record<string, unknown>)[key]));
  }
  return want === have;
}

function matchesOneToOne(want: readonly unknown[], have: readonly unknown[]): boolean {
  const candidates = [...have];
  return want.every(item => {
    const index = candidates.findIndex(candidate => isSubset(item, candidate));
    if (index === -1) return false;
    candidates.splice(index, 1);
    return true;
  });
}

/**
 * gh の失敗（execFile のエラーと、標準エラー・標準出力）から、メッセージを作る。タイムアウトで止めたとき（killed・signal）は、そう分かる文にする。
 * それ以外は、標準エラー・標準出力の内容（HTTP のステータスを含む）をそのまま使う。
 */
export function ghFailureMessage(
  error: { readonly message: string; readonly killed?: boolean; readonly signal?: string | null },
  output: { readonly stderr: string; readonly stdout: string },
  timeoutMs: number
): string {
  if (error.killed === true || (error.signal !== undefined && error.signal !== null)) return `gh が ${timeoutMs / 1000} 秒で終わらなかったので止めました（${error.signal ?? 'killed'}）`;
  return [output.stderr.trim(), output.stdout.trim()].filter(text => text !== '').join('\n') || error.message;
}

/** runGithubSetup が使うもの。本物の入出力は scripts/setup-github.ts がつなぐ。write は --apply のときだけ呼ばれる */
export type GithubSetupDeps = {
  readonly get: GhGet;
  readonly write: GhWrite;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (line: string) => void;
};

/** 変える必要があるもの1件。summary は表示用の説明 */
type Change = { readonly method: WriteMethod; readonly path: string; readonly body?: unknown; readonly summary: string };

type Planner = (get: GhGet, warn: (text: string) => void) => Promise<readonly Change[]>;

const USAGE = '使い方：pnpm github:setup [--apply]（--apply なしは、確かめるだけで何も変えない）';
const ADMIN_ORG_HINT = 'Team の操作には admin:org のスコープが要ります。`gh auth refresh -h github.com -s admin:org` を実行してから、もう一度試してください。';
/** Team がリポジトリに持つ権限を返させる Accept（role_name・permissions が付く） */
const REPOSITORY_ACCEPT = 'application/vnd.github.v3.repository+json';
/** Team が Write（push）だけを持つときの、リポジトリの応答の形 */
const WRITE_PERMISSIONS = { permissions: { admin: false, maintain: false, push: true } };

const { owner, repo, team } = GITHUB_SETTINGS;
const repoPath = `repos/${owner}/${repo}`;
const teamPath = `orgs/${owner}/teams/${team.slug}`;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFound(error: unknown): boolean {
  return /HTTP 404/u.test(errorMessage(error));
}

function change(method: WriteMethod, path: string, summary: string, body?: unknown): Change {
  return { method, path, summary, ...(body === undefined ? {} : { body }) };
}

/** GET して、404 なら found: false（それ以外の失敗は例外のまま） */
async function lookup(get: GhGet, path: string, accept?: string): Promise<{ readonly found: boolean; readonly value: unknown }> {
  try {
    return { found: true, value: await get(path, accept) };
  } catch (error) {
    if (isNotFound(error)) return { found: false, value: undefined };
    throw error;
  }
}

/** 応答がオブジェクト（配列・null でない）であることを確かめる。違えば、何の応答かを書いた例外 */
function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${what}の応答がオブジェクトではありません`);
  return value as Record<string, unknown>;
}

/** 応答が配列であることを確かめる */
function asArray(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${what}の応答が配列ではありません`);
  return value as readonly unknown[];
}

/** path を GET して、want が含まれていれば何も変えない。なければ（404 を含む）書き込みを1件返す */
async function ensure(get: GhGet, spec: { readonly readPath: string; readonly want: unknown; readonly accept?: string; readonly write: Change }): Promise<readonly Change[]> {
  const current = await lookup(get, spec.readPath, spec.accept);
  return current.found && isSubset(spec.want, current.value) ? [] : [spec.write];
}

/** 今ログインしている人の login。Team のメンバーから外すために使う */
async function currentLogin(get: GhGet): Promise<string> {
  const user = asObject(await get('user'), 'GET user');
  if (typeof user.login !== 'string' || user.login === '') throw new Error('GET user の応答に login がありません');
  return user.login;
}

/**
 * Team：なければ作る。実行者は Team を作ると自動でメンバーになるので、メンバーなら（作ったときも、すでにあるときも）外す。
 * リポジトリの権限は Write（push）にする。メンバーはスクリプトでは管理しない（判断4）。
 */
const planTeam: Planner = async get => {
  const login = await currentLogin(get);
  const removal = change('DELETE', `${teamPath}/memberships/${login}`, `実行者（${login}）を Team のメンバーから外す`);
  const permission = change('PUT', `${teamPath}/repos/${owner}/${repo}`, `Team にリポジトリの権限（${team.permission}＝Write）を付ける`, { permission: team.permission });
  const existing = await lookup(get, teamPath);
  if (!existing.found) {
    return [change('POST', `orgs/${owner}/teams`, `Team ${team.slug} を作る`, { name: team.name, privacy: team.privacy }), removal, permission];
  }
  const privacy = isSubset({ privacy: team.privacy }, existing.value) ? [] : [change('PATCH', teamPath, `Team の公開範囲を ${team.privacy} にする`, { privacy: team.privacy })];
  const isMember = (await lookup(get, `${teamPath}/memberships/${login}`)).found;
  const permissionChange = await ensure(get, { readPath: `${teamPath}/repos/${owner}/${repo}`, want: WRITE_PERMISSIONS, accept: REPOSITORY_ACCEPT, write: permission });
  return [...privacy, ...(isMember ? [removal] : []), ...permissionChange];
};

/**
 * 今の値と比べるための、設定の形。GitHub は OrganizationAdmin のバイパスの actor_id を null で返す
 * （公式も「OrganizationAdmin のとき actor_id は無視」）ので、比べるときだけ外す。送る本文は変えない。
 */
function comparable(ruleset: (typeof GITHUB_SETTINGS.rulesets)[number]): unknown {
  return {
    ...ruleset,
    bypass_actors: ruleset.bypass_actors.map(actor => (actor.actor_type === 'OrganizationAdmin' ? { actor_type: actor.actor_type, bypass_mode: actor.bypass_mode } : actor))
  };
}

/** ルールセット：名前で探し、なければ POST、中身が違えばその id に PUT する。設定にないルールセットは触らず、警告を出す */
const planRulesets: Planner = async (get, warn) => {
  const listed = asArray(await get(`${repoPath}/rulesets?includes_parents=false`), 'ルールセットの一覧').map(item => asObject(item, 'ルールセットの一覧の要素'));
  const known = new Set<string>(GITHUB_SETTINGS.rulesets.map(ruleset => ruleset.name));
  for (const item of listed.filter(entry => !known.has(String(entry.name)))) {
    warn(`設定にないルールセット ${String(item.name)}（enforcement: ${String(item.enforcement)}）があります。触りません`);
  }
  const changes: Change[] = [];
  for (const ruleset of GITHUB_SETTINGS.rulesets) {
    const bypass = ruleset.bypass_actors.length === 0 ? 'バイパスなし' : 'バイパスは admin・組織のオーナーだけ';
    const label = `ルールセット ${ruleset.name}（${ruleset.rules.map(rule => rule.type).join('・')}、${bypass}）`;
    const found = listed.find(entry => entry.name === ruleset.name);
    if (found === undefined) {
      changes.push(change('POST', `${repoPath}/rulesets`, `${label}を作る`, ruleset));
      continue;
    }
    const path = `${repoPath}/rulesets/${String(found.id)}`;
    if (!isSubset(comparable(ruleset), asObject(await get(path), `ルールセット ${ruleset.name}`))) changes.push(change('PUT', path, `${label}を直す`, ruleset));
  }
  return changes;
};

type BranchPolicy = Readonly<Record<string, unknown>>;

/** Environment のデプロイできるブランチの一覧。ブランチの制限がカスタムでないと 404 になるので、その場合は空 */
async function listBranchPolicies(get: GhGet, path: string): Promise<readonly BranchPolicy[]> {
  const current = await lookup(get, path);
  if (!current.found) return [];
  const body = asObject(current.value, 'デプロイできるブランチの一覧');
  return asArray(body.branch_policies ?? [], 'デプロイできるブランチの一覧（branch_policies）').map(item => asObject(item, 'デプロイできるブランチ'));
}

type EnvironmentSetting = (typeof GITHUB_SETTINGS.environments)[number];

type Reviewer = { readonly login: string; readonly id: number };

/** 承認者の login から id を引く（id は設定に書かない） */
async function lookupReviewers(get: GhGet, logins: readonly string[]): Promise<readonly Reviewer[]> {
  const reviewers: Reviewer[] = [];
  for (const login of logins) {
    const user = asObject(await get(`users/${login}`), `GET users/${login}`);
    if (typeof user.id !== 'number') throw new Error(`GET users/${login} の応答に id がありません`);
    reviewers.push({ login, id: user.id });
  }
  return reviewers;
}

/** PUT environments/{name} の本文。承認者・待ち時間も毎回明示する（省くと既存の承認者を消しうる） */
function environmentBody(environment: EnvironmentSetting, reviewers: readonly Reviewer[]): unknown {
  return {
    wait_timer: environment.waitTimer,
    prevent_self_review: environment.preventSelfReview,
    reviewers: reviewers.map(reviewer => ({ type: 'User', id: reviewer.id })),
    deployment_branch_policy: environment.deploymentBranchPolicy
  };
}

/**
 * GET environments/{name} の応答が、設定と同じか。ブランチの制限は deployment_branch_policy、
 * 承認者・自分の承認の禁止・待ち時間は protection_rules（本文とは形が違う）から読む。
 */
function environmentMatches(environment: EnvironmentSetting, reviewers: readonly Reviewer[], value: unknown): boolean {
  const keys = reviewers.map(reviewer => `User:${reviewer.id}`);
  const current = asObject(value, `Environment ${environment.name}`);
  const rules = asArray(current.protection_rules ?? [], `Environment ${environment.name} の protection_rules`).map(rule => asObject(rule, 'protection_rules の要素'));
  const required = rules.find(rule => rule.type === 'required_reviewers');
  const haveKeys = asArray(required?.reviewers ?? [], 'required_reviewers の reviewers')
    .map(item => asObject(item, 'reviewers の要素'))
    .map(item => `${String(item.type)}:${String(asObject(item.reviewer, 'reviewers の reviewer').id)}`);
  const waitTimer = rules.find(rule => rule.type === 'wait_timer')?.wait_timer ?? 0;
  return (
    isSubset({ deployment_branch_policy: environment.deploymentBranchPolicy }, current) &&
    [...haveKeys].sort().join() === [...keys].sort().join() &&
    (required?.prevent_self_review ?? false) === environment.preventSelfReview &&
    waitTimer === environment.waitTimer
  );
}

/**
 * Environment：なければ作り（PUT）、ブランチの制限・承認者が違えば直す。
 * 許可するブランチは設定のものだけにする（足りなければ足し、余りは消す）。
 */
async function planEnvironment(get: GhGet, environment: EnvironmentSetting): Promise<readonly Change[]> {
  const base = `${repoPath}/environments/${environment.name}`;
  const reviewers = await lookupReviewers(get, environment.reviewers);
  const current = await lookup(get, base);
  const allowedRefs = environment.branchPolicies.map(policy => `${policy.type}: ${policy.name}`).join('・');
  const reviewerLabel = `承認者 ${reviewers.map(reviewer => `${reviewer.login}（id ${reviewer.id}）`).join('・')}`;
  const environmentChange =
    current.found && environmentMatches(environment, reviewers, current.value)
      ? []
      : [change('PUT', base, `Environment ${environment.name}（${allowedRefs || 'ref の制限なし'}、${reviewerLabel}）を設定する`, environmentBody(environment, reviewers))];
  if (environment.branchPolicies.length === 0) return environmentChange;
  const policiesPath = `${base}/deployment-branch-policies`;
  const present = await listBranchPolicies(get, policiesPath);
  const same = (policy: BranchPolicy, wanted: { readonly name: string; readonly type: string }) => policy.name === wanted.name && policy.type === wanted.type;
  const missing = environment.branchPolicies.filter(wanted => !present.some(policy => same(policy, wanted)));
  const extra = present.filter(policy => !environment.branchPolicies.some(wanted => same(policy, wanted)));
  return [
    ...environmentChange,
    ...missing.map(wanted => change('POST', policiesPath, `${environment.name} にデプロイできる ${wanted.type} ${wanted.name} を足す`, wanted)),
    ...extra.map(policy => change('DELETE', `${policiesPath}/${String(policy.id)}`, `${environment.name} にデプロイできる ${String(policy.type)} ${String(policy.name)} を消す`))
  ];
}

const planEnvironments: Planner = async get => {
  const changes: Change[] = [];
  for (const environment of GITHUB_SETTINGS.environments) changes.push(...(await planEnvironment(get, environment)));
  return changes;
};

/** Actions：有効にして SHA 固定を必須にし、workflow の権限と、fork からの PR の承認を設定する */
const planActions: Planner = async get => {
  const { actions } = GITHUB_SETTINGS;
  const specs = [
    { path: `${repoPath}/actions/permissions`, body: actions.permissions, summary: 'Actions を有効にし、Action の SHA 固定を必須にする' },
    { path: `${repoPath}/actions/permissions/workflow`, body: actions.workflowPermissions, summary: 'Actions の workflow の権限を read にし、PR の承認をさせない' },
    { path: `${repoPath}/actions/permissions/fork-pr-contributor-approval`, body: actions.forkPullRequestApproval, summary: 'fork からの PR は、外部の人すべてで workflow の承認を必須にする' }
  ];
  const changes: Change[] = [];
  for (const { path, body, summary } of specs) {
    changes.push(...(await ensure(get, { readPath: path, want: body, write: change('PUT', path, summary, body) })));
  }
  return changes;
};

/** リポジトリの設定：merge した PR のブランチを自動で消す */
const planRepository: Planner = async get =>
  ensure(get, {
    readPath: repoPath,
    want: GITHUB_SETTINGS.repository,
    write: change('PATCH', repoPath, 'merge した PR のブランチを自動で消す', GITHUB_SETTINGS.repository)
  });

/** セキュリティ：Secret scanning・push protection・脆弱性の非公開の報告・Dependabot alerts を有効にする（public では無料） */
const planSecurity: Planner = async get => {
  const reportingPath = `${repoPath}/private-vulnerability-reporting`;
  const alertsPath = `${repoPath}/vulnerability-alerts`;
  return [
    ...(await ensure(get, {
      readPath: repoPath,
      want: { security_and_analysis: GITHUB_SETTINGS.securityAndAnalysis },
      write: change('PATCH', repoPath, 'Secret scanning と push protection を有効にする', { security_and_analysis: GITHUB_SETTINGS.securityAndAnalysis })
    })),
    ...(await ensure(get, { readPath: reportingPath, want: { enabled: true }, write: change('PUT', reportingPath, '脆弱性の非公開の報告を有効にする') })),
    // 有効なら 204（本文なし）、無効なら 404
    ...(await ensure(get, { readPath: alertsPath, want: undefined, write: change('PUT', alertsPath, 'Dependabot alerts を有効にする') }))
  ];
};

const STEPS: readonly (readonly [string, Planner])[] = [
  // タグを保護してから production に許可し、Environment の承認を設定してから Team に Write を付ける。
  ['ルールセット', planRulesets],
  ['Environment', planEnvironments],
  ['Team', planTeam],
  ['Actions', planActions],
  ['リポジトリ', planRepository],
  ['セキュリティ', planSecurity]
];

/**
 * GitHub の設定を確かめる・反映する。終了コードを返す：成功 0、API・引数の誤り 1。
 * 引数は `--apply` だけ。今の状態を GET して、設定と違うものだけを一覧にする。
 * なしなら一覧を表示するだけ（write は呼ばない）、`--apply` なら一覧を順に書き込む。
 */
export async function runGithubSetup(args: readonly string[], deps: GithubSetupDeps): Promise<number> {
  const { get, write, writeOut, writeErr } = deps;
  const unknown = args.find(arg => arg !== '--apply');
  if (unknown !== undefined) {
    writeErr(`知らない引数です：${unknown}`);
    writeErr(USAGE);
    return 1;
  }
  const apply = args.length > 0;
  let step = 'ルールセット';
  try {
    const changes: Change[] = [];
    for (const [label, plan] of STEPS) {
      step = label;
      changes.push(...(await plan(get, text => writeErr(`[警告] ${text}`))));
    }
    step = '反映';
    for (const { method, path, body, summary } of changes) {
      writeOut(`${apply ? '[反映]' : '[予定]'} ${method} ${path}  ${summary}`);
      if (apply) await write(method, path, body);
    }
    writeOut(finalMessage(changes.length, apply));
  } catch (error) {
    const message = errorMessage(error);
    writeErr(`${step === '反映' ? '反映' : `${step}の確認`}で止まりました：${message}`);
    if (step === 'Team' && /HTTP 403|admin:org/u.test(message)) writeErr(ADMIN_ORG_HINT);
    return 1;
  }
  return 0;
}

function finalMessage(count: number, apply: boolean): string {
  if (count === 0) return '変更なし（GitHub の設定は、すでに設定のとおりです）。';
  return apply
    ? `${count} 件を反映しました。もう一度 pnpm github:setup で、変更なしになることを確かめられます。`
    : `${count} 件の変更予定です（何も変えていません）。反映するには pnpm github:setup --apply を実行します。`;
}
