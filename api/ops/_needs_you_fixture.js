// Synthetic only. This module has no data-source dependencies.
function needsYouFixture(scenario = 'items') {
  const empty = { scenario, proposals: [], decisions: [], routines: [], goal: null, nextAction: null, tasks: [], notes: [], brief: null, spend: null, bounce: null };
  if (scenario === 'empty' || scenario === 'error') return empty;
  return {
    ...empty, scenario: 'items',
    proposals: [
      { id: 'sample-task', kind: 'add-task', status: 'pending', title: "Sample proposal: add a task 'Call supplier'", detail: 'A sample task draft for review.' },
      { id: 'sample-note', kind: 'add-note', status: 'pending', title: "Sample proposal: add a note 'Supplier questions'", detail: 'A sample note draft for review.' },
    ],
    decisions: [
      { id: 'sample-l4', level: 'L4', status: 'open', title: 'Sample decision: review a direction', detail: 'A sample question for the decision log.' },
      { id: 'sample-l3', level: 'L3', status: 'open', title: 'Sample decision: review a plan', detail: 'A sample plan awaiting a decision.' },
    ],
    routines: [
      { id: 'sample-failed', status: 'failed', title: 'Sample routine: daily check', detail: 'Sample run did not finish.' },
      { id: 'sample-late', status: 'late', title: 'Sample routine: weekly review', detail: 'Sample run is later than expected.' },
    ],
    goal: 'Prepare a sample supplier conversation.',
    nextAction: 'Write down one sample question.',
    tasks: ['Call supplier', 'Draft a question list', 'Review the sample checklist'],
    notes: ['Supplier questions', 'Conversation checklist'],
    brief: 'Sample date —', spend: '—', bounce: '—',
  };
}
module.exports = { needsYouFixture };
