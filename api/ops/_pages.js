// Ticket 03–04 pages: Profile & goals, Projects & tasks, Memory.
// Underscore prefix: not a Vercel function.

const { escapeHtml } = require('./_lib');
const {
  INBOX_LABELS,
  getInboxItem,
  getProfile,
  getSharedChat,
  inboxLabelText,
  listInboxItems,
  listMailAudit,
  notesSelectableForChat,
  pendingProposals,
  searchNotes,
  statusLabel,
} = require('./_store');
const { persistenceBanner, shellPage } = require('./_shell');

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function profilePage({ email, store, snapshot, notice, error }) {
  const profile = getProfile(store, email) || { role: '', timezone: '', writingPreferences: '' };
  const goal = store.goal || { title: '', definitionOfDone: '', nextStep: '', targetDate: '' };
  return shellPage({
    title: 'LAVAALL OS — Profile & goals',
    email,
    area: 'profile',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Profile &amp; goals</h1>
      <p>Your working profile and the single current company goal. Nothing is pre-filled.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">You</div>
          <h2>Profile</h2>
          ${profile.role || profile.timezone || profile.writingPreferences ? '' : '<p class="empty">No profile saved yet.</p>'}
          <form method="POST" action="/ops/profile">
            <input type="hidden" name="action" value="save-profile"/>
            <input type="hidden" name="returnTo" value="/ops/profile"/>
            <label for="role">Role</label>
            <input id="role" name="role" maxlength="80" value="${escapeHtml(profile.role)}" placeholder="e.g. Founder"/>
            <label for="timezone">Timezone</label>
            <input id="timezone" name="timezone" maxlength="80" value="${escapeHtml(profile.timezone)}" placeholder="e.g. Africa/Freetown"/>
            <label for="writing">Writing preferences</label>
            <textarea id="writing" name="writingPreferences" maxlength="800" placeholder="Tone, length, languages">${escapeHtml(profile.writingPreferences)}</textarea>
            <button class="btn" type="submit">Save profile</button>
          </form>
        </section>
        <section class="card">
          <div class="kicker">Company</div>
          <h2>Current goal</h2>
          ${store.goal ? '' : '<p class="empty">No current goal saved yet.</p>'}
          <form method="POST" action="/ops/profile">
            <input type="hidden" name="action" value="save-goal"/>
            <input type="hidden" name="returnTo" value="/ops/profile"/>
            <label for="goal-title">Goal</label>
            <input id="goal-title" name="title" required maxlength="200" value="${escapeHtml(goal.title)}" placeholder="What we are finishing"/>
            <label for="goal-done">Definition of done</label>
            <textarea id="goal-done" name="definitionOfDone" maxlength="400">${escapeHtml(goal.definitionOfDone)}</textarea>
            <label for="goal-next">Next step</label>
            <input id="goal-next" name="nextStep" maxlength="200" value="${escapeHtml(goal.nextStep)}"/>
            <label for="goal-date">Target date (optional)</label>
            <input id="goal-date" name="targetDate" type="date" value="${escapeHtml(goal.targetDate)}"/>
            <button class="btn" type="submit">Save goal</button>
          </form>
        </section>
      </div>
    `,
  });
}

function tasksPage({ email, store, snapshot, notice, error }) {
  const projectOptions = ['<option value="">No project</option>']
    .concat(store.projects.map((project) => option(project.id, project.name, false)))
    .join('');
  const projectName = (id) => {
    const found = store.projects.find((project) => project.id === id);
    return found ? found.name : '';
  };
  const projects = store.projects.length
    ? `<ul class="list">${store.projects.map((project) => (
      `<li><strong>${escapeHtml(project.name)}</strong>${project.finishLine ? ` — finish line: ${escapeHtml(project.finishLine)}` : ''}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No projects yet.</p>';

  const tasks = store.tasks.length
    ? store.tasks.map((task) => `
        <li>
          <form method="POST" action="/ops/tasks" class="task-row">
            <input type="hidden" name="action" value="update-task"/>
            <input type="hidden" name="id" value="${escapeHtml(task.id)}"/>
            <input type="hidden" name="returnTo" value="/ops/tasks"/>
            <p><strong>${escapeHtml(task.title)}</strong>
              ${projectName(task.projectId) ? ` · ${escapeHtml(projectName(task.projectId))}` : ''}
              ${task.due ? ` · due ${escapeHtml(task.due)}` : ''}</p>
            <label>
              Status
              <select name="status">
                ${option('todo', 'To do', task.status === 'todo')}
                ${option('doing', 'Doing', task.status === 'doing')}
                ${option('done', 'Done', task.status === 'done')}
              </select>
            </label>
            <label>Next action <input name="nextAction" maxlength="200" value="${escapeHtml(task.nextAction)}"/></label>
            <button class="btn btn-sm" type="submit">Update ${escapeHtml(statusLabel(task.status))}</button>
          </form>
        </li>`).join('')
    : '';

  return shellPage({
    title: 'LAVAALL OS — Projects & tasks',
    email,
    area: 'tasks',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Projects &amp; tasks</h1>
      <p>Shared work list. Status is To do, Doing, or Done. No invented owners or deadlines.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">Projects</div>
          <h2>Add a project</h2>
          ${projects}
          <form method="POST" action="/ops/tasks">
            <input type="hidden" name="action" value="add-project"/>
            <input type="hidden" name="returnTo" value="/ops/tasks"/>
            <label for="project-name">Name</label>
            <input id="project-name" name="name" required maxlength="160" placeholder="Catalog image pack"/>
            <label for="project-finish">Finish line</label>
            <input id="project-finish" name="finishLine" maxlength="240" placeholder="What done looks like"/>
            <button class="btn" type="submit">Save project</button>
          </form>
        </section>
        <section class="card">
          <div class="kicker">Tasks</div>
          <h2>Add a task</h2>
          ${store.tasks.length ? '' : '<p class="empty">No tasks yet.</p>'}
          <form method="POST" action="/ops/tasks">
            <input type="hidden" name="action" value="add-task"/>
            <input type="hidden" name="returnTo" value="/ops/tasks"/>
            <label for="task-title-page">Title</label>
            <input id="task-title-page" name="title" required maxlength="160"/>
            <label for="task-status">Status</label>
            <select id="task-status" name="status">
              ${option('todo', 'To do', true)}
              ${option('doing', 'Doing', false)}
              ${option('done', 'Done', false)}
            </select>
            <label for="task-next-page">Next action (optional)</label>
            <input id="task-next-page" name="nextAction" maxlength="200"/>
            <label for="task-due">Due (optional)</label>
            <input id="task-due" name="due" type="date"/>
            <label for="task-project">Project (optional)</label>
            <select id="task-project" name="projectId">${projectOptions}</select>
            <button class="btn" type="submit">Save task</button>
          </form>
        </section>
      </div>
      <section class="card" style="margin-top:14px">
        <div class="kicker">Open and done</div>
        <h2>All tasks</h2>
        ${tasks ? `<ul class="list">${tasks}</ul>` : '<p class="empty">No tasks yet.</p>'}
      </section>
    `,
  });
}

function memoryPage({ email, store, snapshot, notice, error, search }) {
  const query = typeof search === 'string' ? search : '';
  const notes = searchNotes(store, query);
  const list = notes.length
    ? notes.map((note) => `
        <li>
          <form method="POST" action="/ops/memory" class="task-row">
            <input type="hidden" name="action" value="update-note"/>
            <input type="hidden" name="id" value="${escapeHtml(note.id)}"/>
            <input type="hidden" name="returnTo" value="/ops/memory"/>
            <label>Title <input name="title" required maxlength="160" value="${escapeHtml(note.title)}"/></label>
            <label>Body <textarea name="body" maxlength="4000">${escapeHtml(note.body)}</textarea></label>
            <label>Source (optional) <input name="source" maxlength="240" value="${escapeHtml(note.source)}"/></label>
            <button class="btn btn-sm" type="submit">Save changes</button>
          </form>
          <form method="POST" action="/ops/memory">
            <input type="hidden" name="action" value="delete-note"/>
            <input type="hidden" name="id" value="${escapeHtml(note.id)}"/>
            <input type="hidden" name="returnTo" value="/ops/memory"/>
            <button class="btn btn-sm btn-danger" type="submit">Delete</button>
          </form>
        </li>`).join('')
    : '';

  return shellPage({
    title: 'LAVAALL OS — Memory',
    email,
    area: 'memory',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Memory</h1>
      <p>Short facts, preferences, and lessons. Search, edit, or delete. Deleted notes leave search and cannot be selected for future chat.</p>
      <p class="empty">AI-proposed memories (ticket 05) will require review before save. Manual notes save immediately.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">Capture</div>
          <h2>Add a note</h2>
          <form method="POST" action="/ops/memory">
            <input type="hidden" name="action" value="add-note"/>
            <input type="hidden" name="returnTo" value="/ops/memory"/>
            <label for="mem-title">Title</label>
            <input id="mem-title" name="title" required maxlength="160" placeholder="SL quote preference"/>
            <label for="mem-body">Body</label>
            <textarea id="mem-body" name="body" maxlength="4000" placeholder="Fact, preference, or lesson — no invented metrics."></textarea>
            <label for="mem-source">Source (optional)</label>
            <input id="mem-source" name="source" maxlength="240" placeholder="Call, email, or page"/>
            <button class="btn" type="submit">Save note</button>
          </form>
        </section>
        <section class="card">
          <div class="kicker">Find</div>
          <h2>Search</h2>
          <form method="GET" action="/ops/memory">
            <label for="mem-q">Text</label>
            <input id="mem-q" name="q" maxlength="200" value="${escapeHtml(query)}" placeholder="Preference, supplier, lesson"/>
            <button class="btn" type="submit">Search</button>
          </form>
          ${query ? `<p>Showing matches for “${escapeHtml(query)}”.</p>` : '<p>Showing all live notes.</p>'}
        </section>
      </div>
      <section class="card" style="margin-top:14px">
        <div class="kicker">Library</div>
        <h2>Notes</h2>
        ${list ? `<ul class="list">${list}</ul>` : '<p class="empty">No notes match. Save one or clear search.</p>'}
      </section>
    `,
  });
}

function chatPage({ email, store, snapshot, notice, error, chatSetup }) {
  const chat = getSharedChat(store);
  const setup = chatSetup || { modelConfigured: false, anthropic: false, openai: false, lead: 'lavaall-ceo' };
  const notes = notesSelectableForChat(store);
  const drafts = pendingProposals(store);
  const goal = store.goal;
  const setupCard = setup.modelConfigured
    ? `<p>Helper connected (${setup.anthropic ? 'Anthropic' : ''}${setup.anthropic && setup.openai ? ' + ' : ''}${setup.openai ? 'OpenAI' : ''}). Lead stays ${escapeHtml(setup.lead)}. Drafts only — nothing is sent or written without confirm.</p>`
    : '<p class="empty">No Anthropic or OpenAI key on this project. Asking a stored next step still reads the selected record. Anything else shows this setup message — no invented reply. Slack stays secondary.</p>';

  const contextPick = `
    <fieldset class="ctx">
      <legend>Context sent with the next message</legend>
      ${goal
        ? `<label class="check"><input type="checkbox" name="useGoal" value="1" checked/> Goal — ${escapeHtml(goal.title)}${goal.nextStep ? ` · next step: ${escapeHtml(goal.nextStep)}` : ''}</label>`
        : '<p class="empty">No current goal. Save one under Profile &amp; goals.</p>'}
      <label for="chat-task">Task (optional)</label>
      <select id="chat-task" name="taskId">
        ${option('', 'No task', true)}
        ${(store.tasks || []).map((task) => option(task.id, `${task.title}${task.nextAction ? ` — ${task.nextAction}` : ''}`, false)).join('')}
      </select>
      <label for="chat-note">Note (optional)</label>
      <select id="chat-note" name="noteId">
        ${option('', 'No note', true)}
        ${notes.map((note) => option(note.id, note.title, false)).join('')}
      </select>
      <p>Checked goal and chosen task/note are attached before send. Deleted notes are not listed.</p>
    </fieldset>`;

  const thread = chat.messages.length
    ? `<ol class="thread">${chat.messages.map((item) => (
      `<li class="bubble ${escapeHtml(item.role)}">
        <div class="kicker">${item.role === 'user' ? 'You' : 'LAVAALL OS assistant'}${item.grounded ? ' · from record' : ''}${item.setup ? ' · setup' : ''}</div>
        <p>${escapeHtml(item.text)}</p>
        ${item.contextSummary ? `<p class="who">${escapeHtml(item.contextSummary)}</p>` : ''}
      </li>`
    )).join('')}</ol>`
    : '<p class="empty">No messages yet. Select context, then ask.</p>';

  const proposalList = drafts.length
    ? `<ul class="list">${drafts.map((item) => (
      `<li>
        <p><span class="tag">Draft</span><strong>${escapeHtml(item.kind)}</strong> — ${escapeHtml(item.title || item.fields.title || 'Untitled')}</p>
        ${item.body || item.fields.body ? `<p>${escapeHtml(item.body || item.fields.body)}</p>` : ''}
        <form method="POST" action="/ops/chat" style="display:inline">
          <input type="hidden" name="action" value="confirm-proposal"/>
          <input type="hidden" name="id" value="${escapeHtml(item.id)}"/>
          <input type="hidden" name="returnTo" value="/ops/chat"/>
          <button class="btn btn-sm" type="submit">Confirm draft</button>
        </form>
        <form method="POST" action="/ops/chat" style="display:inline">
          <input type="hidden" name="action" value="dismiss-proposal"/>
          <input type="hidden" name="id" value="${escapeHtml(item.id)}"/>
          <input type="hidden" name="returnTo" value="/ops/chat"/>
          <button class="btn btn-sm btn-danger" type="submit">Dismiss</button>
        </form>
      </li>`
    )).join('')}</ul>`
    : '<p class="empty">No pending drafts. Chat cannot write the store until you confirm a proposal.</p>';

  return shellPage({
    title: 'LAVAALL OS — Contextual chat',
    email,
    area: 'chat',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Contextual chat</h1>
      <p>Front door for LAVAALL OS. lavaall-ceo stays lead. Helpers never auto-send mail, auto-deploy, or mutate records.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">Setup</div>
          <h2>Helper status</h2>
          ${setupCard}
        </section>
        <section class="card">
          <div class="kicker">Drafts</div>
          <h2>Proposed writes</h2>
          ${proposalList}
        </section>
      </div>
      <section class="card" style="margin-top:14px">
        <div class="kicker">Thread</div>
        <h2>Conversation</h2>
        ${thread}
        <form method="POST" action="/ops/chat">
          <input type="hidden" name="action" value="send-chat"/>
          <input type="hidden" name="returnTo" value="/ops/chat"/>
          ${contextPick}
          <label for="chat-message">Message</label>
          <textarea id="chat-message" name="message" required maxlength="2000" placeholder="What is the next step?"></textarea>
          <button class="btn" type="submit">Send</button>
        </form>
      </section>
    `,
  });
}

function inboxPage({ email, store, snapshot, notice, error, inboxSetup, openThread }) {
  const setup = inboxSetup || { gmailConfigured: false, supportConnected: false, supportMailbox: 'support@lavaall.com' };
  const items = listInboxItems(store);
  const audit = listMailAudit(store).slice(0, 8);
  const open = openThread ? getInboxItem(store, openThread) : null;
  const setupCard = setup.supportConnected
    ? `<p>Live mailbox is ${escapeHtml(setup.supportMailbox)}. Refresh to list threads. Send still needs Confirm send.</p>
       <form method="POST" action="/ops/inbox">
         <input type="hidden" name="action" value="refresh-inbox"/>
         <input type="hidden" name="returnTo" value="/ops/inbox"/>
         <button class="btn btn-sm" type="submit">Refresh live mail</button>
       </form>`
    : `<p class="empty">Live support@ not connected. Paste a snapshot below — it is never marked as live mail. To list and confirm-send from support@lavaall.com, set OPS_GMAIL_* on a refresh token for that mailbox (scopes gmail.readonly + gmail.send). If only a personal Gmail token is on Preview, keep using paste.</p>`;

  const rows = items.length
    ? `<ul class="list">${items.map((item) => (
      `<li>
        <span class="tag">${item.live ? 'Live' : 'Paste snapshot'}</span>
        <span class="tag">${escapeHtml(inboxLabelText(item.label))}</span>
        ${item.sentMessageId ? '<span class="tag">Sent</span>' : ''}
        <strong>${escapeHtml(item.subject)}</strong>
        <p>${escapeHtml(item.from || 'Unknown sender')}${item.snippet ? ` — ${escapeHtml(item.snippet)}` : ''}</p>
        <p><a href="/ops/inbox?thread=${escapeHtml(item.id)}">Open</a></p>
      </li>`
    )).join('')}</ul>`
    : '<p class="empty">No snapshots or live threads yet. Paste one below.</p>';

  const labelOptions = INBOX_LABELS.map((value) => option(value, inboxLabelText(value), open && open.label === value)).join('');

  const openCard = open
    ? `<section class="card" style="margin-top:14px">
        <div class="kicker">${open.live ? 'Live thread' : 'Paste snapshot — not live mail'}</div>
        <h2>${escapeHtml(open.subject)}</h2>
        <p>From ${escapeHtml(open.from || 'unknown')}</p>
        <p>${escapeHtml(open.body || open.snippet || '')}</p>
        <form method="POST" action="/ops/inbox">
          <input type="hidden" name="action" value="save-inbox-draft"/>
          <input type="hidden" name="id" value="${escapeHtml(open.id)}"/>
          <input type="hidden" name="returnTo" value="/ops/inbox?thread=${escapeHtml(open.id)}"/>
          <label for="inbox-label">Label</label>
          <select id="inbox-label" name="label">${labelOptions}</select>
          <label for="inbox-draft">Draft reply</label>
          <textarea id="inbox-draft" name="draft" maxlength="4000">${escapeHtml(open.draft)}</textarea>
          <button class="btn" type="submit">Save draft</button>
        </form>
        ${open.sentMessageId
          ? `<p class="ok">Already sent (id ${escapeHtml(open.sentMessageId)}). Confirm send is idempotent.</p>`
          : `<form method="POST" action="/ops/inbox">
              <input type="hidden" name="action" value="ready-inbox-send"/>
              <input type="hidden" name="id" value="${escapeHtml(open.id)}"/>
              <input type="hidden" name="returnTo" value="/ops/inbox?thread=${escapeHtml(open.id)}"/>
              <button class="btn btn-sm" type="submit">Ready to send</button>
            </form>
            ${open.pendingConfirm && open.confirmToken
              ? `<form method="POST" action="/ops/inbox">
                  <input type="hidden" name="action" value="confirm-inbox-send"/>
                  <input type="hidden" name="id" value="${escapeHtml(open.id)}"/>
                  <input type="hidden" name="token" value="${escapeHtml(open.confirmToken)}"/>
                  <input type="hidden" name="returnTo" value="/ops/inbox?thread=${escapeHtml(open.id)}"/>
                  <button class="btn" type="submit">Confirm send</button>
                </form>`
              : '<p>Save a draft, then Ready to send, then Confirm send. Nothing goes out before Confirm send.</p>'}`}
      </section>`
    : '';

  const auditList = audit.length
    ? `<ul class="list">${audit.map((entry) => (
      `<li>${escapeHtml(entry.email)} · ${escapeHtml(entry.subject || '')} · message ${escapeHtml(entry.messageId || 'pending')}</li>`
    )).join('')}</ul>`
    : '<p class="empty">No confirm-send audit yet.</p>';

  return shellPage({
    title: 'LAVAALL OS — Inbox',
    email,
    area: 'inbox',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Inbox</h1>
      <p>support@lavaall.com triage. Either founder may confirm-send. Chat cannot send mail.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">Mailbox</div>
          <h2>Live support@</h2>
          ${setupCard}
        </section>
        <section class="card">
          <div class="kicker">Manual</div>
          <h2>Paste a snapshot</h2>
          <p>Marked as a paste snapshot, not live mail.</p>
          <form method="POST" action="/ops/inbox">
            <input type="hidden" name="action" value="paste-inbox"/>
            <input type="hidden" name="returnTo" value="/ops/inbox"/>
            <label for="paste-from">From</label>
            <input id="paste-from" name="from" maxlength="240" placeholder="customer@example.com"/>
            <label for="paste-subject">Subject</label>
            <input id="paste-subject" name="subject" required maxlength="200"/>
            <label for="paste-body">Body</label>
            <textarea id="paste-body" name="body" maxlength="4000"></textarea>
            <button class="btn" type="submit">Save snapshot</button>
          </form>
        </section>
      </div>
      <section class="card" style="margin-top:14px">
        <div class="kicker">Queue</div>
        <h2>Threads</h2>
        ${rows}
      </section>
      ${openCard}
      <section class="card" style="margin-top:14px">
        <div class="kicker">Audit</div>
        <h2>Confirm-send log</h2>
        ${auditList}
      </section>
    `,
  });
}

module.exports = { profilePage, tasksPage, memoryPage, chatPage, inboxPage };
