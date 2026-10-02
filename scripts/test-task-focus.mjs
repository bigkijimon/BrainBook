import assert from 'node:assert/strict';
import { matchesFocus, scheduledTasks } from '../src/task-focus.mjs';

const tasks = [
  { id: 'work', status: 'working', lifeArea: 'work', isArchived: false },
  { id: 'learning', status: 'scheduled', lifeArea: 'learning', dueAt: '2026-10-02', isArchived: false },
  { id: 'routine', status: 'scheduled', lifeArea: 'work', dueAt: '2026-10-01', isArchived: false },
  { id: 'done', status: 'done', lifeArea: 'work', dueAt: '2026-09-30', isArchived: false },
  { id: 'archived', status: 'scheduled', lifeArea: 'play', dueAt: '2026-09-29', isArchived: true },
];

assert.equal(matchesFocus(tasks[0], 'work'), true);
assert.equal(matchesFocus(tasks[1], 'work'), false);
assert.equal(matchesFocus(tasks[1], 'personal'), true);
assert.equal(matchesFocus(tasks[0], 'personal'), false);
assert.deepEqual(scheduledTasks(tasks).map((task) => task.id), ['routine', 'learning']);
console.log('PASS Work/Personal focus boundaries');
console.log('PASS top-bar scheduled list excludes done and archived entries and sorts by due date');
