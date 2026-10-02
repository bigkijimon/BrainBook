const taskArea = (task) => String(task?.lifeArea ?? task?.area ?? 'work').toLowerCase();

export function matchesFocus(task, focus) {
  const isWork = taskArea(task) === 'work';
  return focus === 'personal' ? !isWork : isWork;
}

export function scheduledTasks(tasks) {
  return tasks
    .filter((task) => task.status === 'scheduled' && !task.isArchived)
    .sort((left, right) => {
      const leftDate = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
      const rightDate = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;
      return leftDate - rightDate || left.title.localeCompare(right.title);
    });
}
