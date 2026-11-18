#!/usr/bin/env python3
"""Codex用のセッション記録をworktree内で管理する（開発概要書10.1）。"""
import argparse
from datetime import date
import json
from pathlib import Path
import re
import sys
from uuid import uuid4

FILENAME = re.compile(r'\d{4}-\d{2}-\d{2}-[a-z0-9-]+-session\.md\Z')
ALIAS = re.compile(r'[A-Za-z0-9_-]+\Z')


def entries(store):
    """読み取りだけで記録を列挙する。外部へのリンクはたどらない。"""
    files = [p for p in store.glob('*-session.md')
             if FILENAME.fullmatch(p.name) and p.is_file() and not p.is_symlink()]
    return sorted(files, key=lambda p: (p.stat().st_mtime_ns, p.name), reverse=True)


def aliases(store):
    """別名の構造と参照先を検証する。破損を空データ扱いにしない。"""
    target = store / 'aliases.json'
    if not target.exists():
        return {}
    if target.is_symlink():
        raise ValueError('別名ファイルがシンボリックリンクです')
    try:
        data = json.loads(target.read_text(encoding='utf-8'))
        if not isinstance(data, dict) or any(
            not ALIAS.fullmatch(k) or not isinstance(v, str) or not FILENAME.fullmatch(v)
            for k, v in data.items()
        ):
            raise ValueError()
        return data
    except (ValueError, TypeError) as error:
        raise ValueError('別名ファイルが不正です') from error


def resolve(store, selector):
    """別名・ID・日付を解決し、曖昧なIDは拒否する。"""
    files = entries(store)
    selected = aliases(store).get(selector, selector) if selector else ''
    matches = [p for p in files if not selected or p.name == selected or
               p.name[11:-11].startswith(selected) or p.name.startswith(selected)]
    if not matches:
        raise ValueError('セッションが見つかりません')
    if len(matches) > 1 and selected and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', selected):
        raise ValueError('IDが曖昧です。長いIDまたはファイル名を指定してください')
    return matches[0]


def describe(file, names=None):
    """ファイルの本文と保存時のメタデータを返す。"""
    content = file.read_text(encoding='utf-8')
    if not content.strip():
        raise ValueError('保存されたセッションが空です')
    tasks = re.findall(r'^\s*[-*] \[([ xX-])\]', content, re.M)
    metadata = dict(re.findall(r'^\*\*([\w ]+):\*\*[ \t]*(.*)$', content, re.M))
    return {'filename': file.name, 'id': file.name[11:-11], 'path': str(file.resolve()),
            'date': file.name[:10], 'metadata': metadata, 'lines': len(content.splitlines()),
            'tasks': {'total': len(tasks), 'completed': sum(t.lower() == 'x' for t in tasks),
                      'in_progress': tasks.count('-')},
            'aliases': sorted(k for k, v in (names or {}).items() if v == file.name),
            'bytes': file.stat().st_size, 'modified': file.stat().st_mtime, 'content': content}


def validate_store(store):
    """保存先のリンクとClaude側資源へのアクセスを拒否する。"""
    absolute = store.absolute()
    if any(p.is_symlink() for p in (absolute, *absolute.parents)):
        raise ValueError('保存先または親ディレクトリがシンボリックリンクです')
    if '.claude' in absolute.parts:
        raise ValueError('Claude側の資源は保存先にできません')


def update_alias(store, args):
    """読み取りから置換まで排他し、別名更新の取りこぼしを防ぐ。"""
    store.mkdir(parents=True, exist_ok=True)
    lock = store / '.aliases.lock'
    try:
        stream = lock.open('x', encoding='utf-8')
    except FileExistsError as error:
        raise ValueError('別名を更新中です。所有者の終了を確認してから再試行してください') from error
    try:
        with stream:
            stream.write('session_store.py\n')
        data = aliases(store)
        name = args.name
        if not ALIAS.fullmatch(name):
            raise ValueError('別名が不正です。英数字・ハイフン・下線だけを使ってください')
        if args.action == 'alias':
            data[name] = resolve(store, args.selector).name
        elif name in data:
            del data[name]
        else:
            raise ValueError('別名が見つかりません')
        temporary = store / f'.aliases-{uuid4().hex}.tmp'
        try:
            with temporary.open('x', encoding='utf-8') as target:
                json.dump(data, target, ensure_ascii=False, indent=2)
            temporary.replace(store / 'aliases.json')
        finally:
            temporary.unlink(missing_ok=True)
        return {'aliases': data}
    finally:
        lock.unlink()


def execute(args):
    """引数で指定された保存・検索・別名操作を実行する。"""
    store = args.store
    validate_store(store)
    action = args.action
    if action == 'save':
        content = sys.stdin.read()
        if not content.strip():
            raise ValueError('空のセッションは保存できません')
        store.mkdir(parents=True, exist_ok=True)
        file = store / f'{date.today().isoformat()}-{uuid4().hex[:12]}-session.md'
        with file.open('x', encoding='utf-8') as stream:
            stream.write(content)
        return describe(file)
    if action == 'list':
        if args.limit < 1 or args.offset < 0:
            raise ValueError('limitは1以上、offsetは0以上で指定してください')
        files = [p for p in entries(store) if
                 (not args.date or p.name.startswith(args.date + '-')) and
                 (not args.search or args.search in p.name)]
        return {'total': len(files), 'sessions': [
            {k: v for k, v in describe(p, aliases(store)).items() if k != 'content'}
            for p in files[args.offset:args.offset + args.limit]]}
    if action == 'aliases':
        return {'aliases': aliases(store)}
    if action in ('alias', 'unalias'):
        return update_alias(store, args)
    result = describe(resolve(store, args.selector), aliases(store))
    if action == 'info':
        result.pop('content')
    return result


def main():
    """CLI。通常操作はJSON、エラーは標準エラーと終了コード1で返す。"""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--store', type=Path, default=Path(__file__).resolve().parents[4] / '.codex/sessions')
    actions = parser.add_subparsers(dest='action', required=True)
    actions.add_parser('save', help='標準入力のMarkdownを新しい記録へ保存')
    listing = actions.add_parser('list')
    listing.add_argument('--limit', type=int, default=50)
    listing.add_argument('--offset', type=int, default=0)
    listing.add_argument('--date')
    listing.add_argument('--search')
    for name in ('load', 'info'):
        actions.add_parser(name).add_argument('selector', nargs='?', default='')
    alias = actions.add_parser('alias')
    alias.add_argument('selector')
    alias.add_argument('name')
    actions.add_parser('unalias').add_argument('name')
    actions.add_parser('aliases')
    args = parser.parse_args()
    try:
        print(json.dumps(execute(args), ensure_ascii=False, indent=2))
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
