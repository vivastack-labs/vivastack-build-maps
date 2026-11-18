"""開発概要書10.1: Codexの引き継ぎをClaudeの状態から分離する。"""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('session_store.py')


class SessionStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Path(self.temp.name) / 'sessions'

    def run_cli(self, *args, body=None, ok=True):
        result = subprocess.run([sys.executable, str(SCRIPT), '--store', str(self.store), *args],
                                input=body, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0 if ok else 1, result.stderr)
        return json.loads(result.stdout) if ok else result.stderr

    def save(self, topic='地図'):
        return self.run_cli('save', body=f'# セッション\n**Project:** maps\n**Branch:** feat/test\n**Worktree:** /tmp/maps\n**Topic:** {topic}\n\n次はテスト。\n')

    def test_save_load_info_alias_round_trip(self):
        saved = self.save()
        self.run_cli('alias', saved['id'], 'map-work')
        loaded = self.run_cli('load', 'map-work')
        self.assertIn('次はテスト', loaded['content'])
        self.assertEqual(self.run_cli('info', 'map-work')['metadata']['Branch'], 'feat/test')
        self.assertEqual(self.run_cli('aliases')['aliases']['map-work'], saved['filename'])
        self.run_cli('unalias', 'map-work')
        self.assertEqual(self.run_cli('aliases')['aliases'], {})

    def test_empty_store_and_missing_session(self):
        self.assertEqual(self.run_cli('list')['total'], 0)
        self.assertIn('見つかりません', self.run_cli('load', ok=False))
        self.assertFalse(self.store.exists())

    def test_unique_saves_filter_and_pagination(self):
        first = self.save('一つ目')
        second = self.save('二つ目')
        self.assertNotEqual(first['filename'], second['filename'])
        page = self.run_cli('list', '--limit', '1', '--offset', '1')
        self.assertEqual(page['total'], 2)
        self.assertEqual(len(page['sessions']), 1)
        self.assertEqual(self.run_cli('list', '--search', first['id'])['total'], 1)
        self.assertEqual(self.run_cli('list', '--date', '2000-01-01')['total'], 0)

    def test_ambiguous_date_and_unknown_alias_do_not_guess(self):
        saved = self.save()
        self.save()
        # 日付指定は最新、短いIDは曖昧なら失敗。
        self.assertIn('content', self.run_cli('load', saved['filename'][:10]))
        self.assertIn('見つかりません', self.run_cli('load', 'missing', ok=False))
        self.assertIn('不正', self.run_cli('alias', saved['id'], '../outside', ok=False))

    def test_invalid_alias_data_and_empty_save_fail(self):
        self.save()
        (self.store / 'aliases.json').write_text('{broken')
        self.assertIn('別名', self.run_cli('aliases', ok=False))
        self.assertIn('空', self.run_cli('save', body=' ', ok=False))

    def test_alias_cannot_read_outside_store(self):
        self.save()
        (self.store / 'aliases.json').write_text(json.dumps({'escape': '../outside.md'}))
        self.assertIn('別名', self.run_cli('load', 'escape', ok=False))

    def test_empty_metadata_does_not_consume_next_line(self):
        saved = self.run_cli('save', body='# 記録\n**Project:**\n**Branch:** feat/test\n**Last Updated:** 2026-11-18\n')
        self.assertEqual(saved['metadata']['Project'], '')
        self.assertEqual(saved['metadata']['Branch'], 'feat/test')
        self.assertEqual(saved['metadata']['Last Updated'], '2026-11-18')

    def test_alias_is_visible_in_list_and_info(self):
        saved = self.save()
        self.run_cli('alias', saved['id'], 'demo-session')
        self.assertEqual(self.run_cli('list')['sessions'][0]['aliases'], ['demo-session'])
        self.assertEqual(self.run_cli('info', 'demo-session')['aliases'], ['demo-session'])

    def test_empty_saved_record_is_not_loadable(self):
        saved = self.save()
        Path(saved['path']).write_text(' ')
        self.assertIn('空', self.run_cli('load', saved['id'], ok=False))

    def test_info_reports_task_statistics(self):
        saved = self.run_cli('save', body='# 記録\n- [x] 完了\n- [ ] 未完了\n- [-] 作業中\n')
        info = self.run_cli('info', saved['id'])
        self.assertEqual(info['tasks'], {'total': 3, 'completed': 1, 'in_progress': 1})

    def test_store_symlink_cannot_write_to_another_directory(self):
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        self.store.symlink_to(outside, target_is_directory=True)
        self.assertIn('リンク', self.run_cli('save', body='# 記録', ok=False))
        self.assertEqual(list(outside.iterdir()), [])

    def test_alias_update_respects_existing_lock(self):
        saved = self.save()
        lock = self.store / '.aliases.lock'
        lock.write_text('another writer')
        self.assertIn('更新中', self.run_cli('alias', saved['id'], 'demo', ok=False))
        self.assertEqual(self.run_cli('aliases')['aliases'], {})
        self.assertEqual(lock.read_text(), 'another writer')


if __name__ == '__main__':
    unittest.main()
