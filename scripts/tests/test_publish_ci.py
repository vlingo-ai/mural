import unittest
from scripts.check_publish_ci import accepted


class PublishCITest(unittest.TestCase):
    def test_requires_exact_successful_main_push(self):
        good = dict(head_sha='a'*40, head_branch='main', event='push',
                    run_number=1, status='completed', conclusion='success')
        self.assertTrue(accepted([good], 'a'*40))
        self.assertFalse(accepted([], 'a'*40))
        for key, value in [('head_sha', 'b'*40), ('head_branch', 'topic'),
                           ('event', 'pull_request'), ('status', 'in_progress'),
                           ('conclusion', 'failure'), ('conclusion', 'cancelled')]:
            self.assertFalse(accepted([{**good, key: value}], 'a'*40))
        self.assertFalse(accepted([good, {**good, 'run_number': 2,
                                         'conclusion': 'failure'}], 'a'*40))
