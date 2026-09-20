// Ticket 03–04 pages: Profile & goals, Projects & tasks, Memory.
// Underscore prefix: not a Vercel function.

const { escapeHtml } = require('./_lib');
const {
  INBOX_LABELS,
  KIT_STATUSES,
  getInboxItem,
  getProfile,
  getSharedChat,
  inboxLabelText,
  lastKitsSync,
  listEvents,
  listInboxItems,
  listKits,
  listMailAudit,
  listRoutines,
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

function calendarPage({ email, store, snapshot, notice, error, calendarSetup }) {
  const setup = calendarSetup || { googleConnected: false, calendarIdSet: false, oauthSet: false };
  const events = listEvents(store);
  const setupCard = setup.googleConnected
    ? `<p>Shared LAVAALL calendar is connected. Refresh pulls events from that calendar only — never Osman’s primary. Creates stay internal-attendee only.</p>
       <form method="POST" action="/ops/calendar">
         <input type="hidden" name="action" value="refresh-calendar"/>
         <input type="hidden" name="returnTo" value="/ops/calendar"/>
         <button class="btn btn-sm" type="submit">Refresh Google agenda</button>
       </form>`
    : `<p class="empty">Google Calendar is not connected. The manual agenda below still works and is stored in KV. No Google events are invented.</p>
       <p>To sync a <strong>shared</strong> LAVAALL calendar (not a personal primary calendar):</p>
       <ol class="list">
         <li>Create a Google Calendar, share it with both founders, and copy its calendar id (not <code>primary</code>).</li>
         <li>Set <code>OPS_GOOGLE_CALENDAR_ID</code> on Vercel Preview.</li>
         <li>Reuse Gmail OAuth (<code>OPS_GMAIL_*</code> client + refresh token) with Calendar scope, or set a separate calendar refresh token.</li>
         <li>Required scope: <code>https://www.googleapis.com/auth/calendar</code> (or <code>calendar.events</code>).</li>
         <li>Workspace admin may still block this the same way support@ Gmail hits “Service Not Allowed” until that policy is fixed. Out of scope for this ticket.</li>
       </ol>
       <p>Checklist: calendar id ${setup.calendarIdSet ? 'set' : 'missing'} · OAuth ${setup.oauthSet ? 'set' : 'missing'}.</p>`;

  const rows = events.length
    ? `<ul class="list">${events.map((event) => {
      const when = event.allDay
        ? `${escapeHtml(event.date)} · all day`
        : `${escapeHtml(event.date)} · ${escapeHtml(event.start)}–${escapeHtml(event.end)} ${escapeHtml(event.timezone)}`;
      return `
        <li>
          ${event.overlaps ? '<span class="tag overlap">Overlaps</span>' : ''}
          ${event.allDay ? '<span class="tag">All day</span>' : '<span class="tag">Timed</span>'}
          ${event.googleEventId ? '<span class="tag">Google</span>' : '<span class="tag">Manual</span>'}
          <strong>${escapeHtml(event.title)}</strong>
          <p>${when}${event.attendees.length ? ` · ${escapeHtml(event.attendees.join(', '))}` : ''}</p>
          ${event.notes ? `<p>${escapeHtml(event.notes)}</p>` : ''}
          ${event.overlaps ? '<p class="err" role="status">This timed event overlaps another on the same day.</p>' : ''}
          <form method="POST" action="/ops/calendar" class="task-row">
            <input type="hidden" name="action" value="update-event"/>
            <input type="hidden" name="id" value="${escapeHtml(event.id)}"/>
            <input type="hidden" name="returnTo" value="/ops/calendar"/>
            <label>Title <input name="title" required maxlength="160" value="${escapeHtml(event.title)}"/></label>
            <label>Date <input name="date" type="date" required value="${escapeHtml(event.date)}"/></label>
            <label class="check"><input type="checkbox" name="allDay" value="1"${event.allDay ? ' checked' : ''}/> All day</label>
            <label>Start <input name="start" type="time" value="${escapeHtml(event.start)}"/></label>
            <label>End <input name="end" type="time" value="${escapeHtml(event.end)}"/></label>
            <label>Timezone <input name="timezone" maxlength="80" value="${escapeHtml(event.timezone)}"/></label>
            <label>Internal attendees <input name="attendees" maxlength="400" value="${escapeHtml(event.attendees.join(', '))}"/></label>
            <label>Notes <textarea name="notes" maxlength="800">${escapeHtml(event.notes)}</textarea></label>
            <button class="btn btn-sm" type="submit">Save changes</button>
          </form>
          <form method="POST" action="/ops/calendar">
            <input type="hidden" name="action" value="delete-event"/>
            <input type="hidden" name="id" value="${escapeHtml(event.id)}"/>
            <input type="hidden" name="returnTo" value="/ops/calendar"/>
            <button class="btn btn-sm btn-danger" type="submit">Delete</button>
          </form>
        </li>`;
    }).join('')}</ul>`
    : '<p class="empty">No events yet. Add a timed or all-day event — nothing is pulled from Google until the shared calendar is connected.</p>';

  return shellPage({
    title: 'LAVAALL OS — Calendar',
    email,
    area: 'calendar',
    notice,
    error,
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Calendar</h1>
      <p>Shared LAVAALL agenda. Internal attendees only (Osman, Abdulhamid, @lavaall.com). Customer invites stay out of v1.</p>
      <div class="grid forms">
        <section class="card">
          <div class="kicker">Google</div>
          <h2>Shared calendar</h2>
          ${setupCard}
        </section>
        <section class="card">
          <div class="kicker">Manual</div>
          <h2>Add an event</h2>
          <form method="POST" action="/ops/calendar">
            <input type="hidden" name="action" value="save-event"/>
            <input type="hidden" name="returnTo" value="/ops/calendar"/>
            <label for="cal-title">Title</label>
            <input id="cal-title" name="title" required maxlength="160" placeholder="Founder sync"/>
            <label for="cal-date">Date</label>
            <input id="cal-date" name="date" type="date" required/>
            <label class="check" for="cal-allday"><input id="cal-allday" type="checkbox" name="allDay" value="1"/> All day</label>
            <label for="cal-start">Start</label>
            <input id="cal-start" name="start" type="time"/>
            <label for="cal-end">End</label>
            <input id="cal-end" name="end" type="time"/>
            <label for="cal-tz">Timezone</label>
            <input id="cal-tz" name="timezone" maxlength="80" value="Africa/Freetown"/>
            <label for="cal-attendees">Internal attendees (optional)</label>
            <input id="cal-attendees" name="attendees" maxlength="400" placeholder="osmanjalloh104@gmail.com, ops@lavaall.com"/>
            <label for="cal-notes">Notes</label>
            <textarea id="cal-notes" name="notes" maxlength="800"></textarea>
            <button class="btn" type="submit">Save event</button>
          </form>
        </section>
      </div>
      <section class="card" style="margin-top:14px">
        <div class="kicker">Agenda</div>
        <h2>Events</h2>
        ${rows}
      </section>
    `,
  });
}

function formatRunAt(ms) {
  if (!ms) return '';
  return `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function runStatusLabel(status) {
  switch (status) {
    case 'ok':
      return 'Saved';
    case 'missing_input':
      return 'Missing inputs';
    case 'unconfigured':
      return 'Helper not connected';
    case 'helper_failed':
      return 'Helper failed';
    default: {
      const _never = status;
      void _never;
      return status || 'No run yet';
    }
  }
}

function routinesPage({ email, store, snapshot, notice, error, chatSetup }) {
  const setup = chatSetup || { modelConfigured: false, anthropic: false, openai: false, lead: 'lavaall-ceo' };
  const routines = listRoutines(store);
  const notes = notesSelectableForChat(store);
  const setupCard = setup.modelConfigured
    ? `<p>Helper connected (${setup.anthropic ? 'Anthropic' : ''}${setup.anthropic && setup.openai ? ' + ' : ''}${setup.openai ? 'OpenAI' : ''}). Run is manual and drafts only — no mail, no schedule.</p>`
    : '<p class="empty">No Anthropic or OpenAI key on this project. You can still edit and copy prompts. Run will show a clear helper-not-connected error — no invented result.</p>';

  const cards = routines.map((routine) => {
    const last = routine.lastRunAt
      ? `<p><span class="tag">${escapeHtml(runStatusLabel(routine.lastRunStatus))}</span>Last run ${escapeHtml(formatRunAt(routine.lastRunAt))}</p>
         <p>${escapeHtml(routine.lastRunResult)}</p>`
      : '<p class="empty">No run yet. Copy the prompt or run it manually with the context it needs.</p>';
    const history = routine.runs.length
      ? `<ul class="list">${routine.runs.slice(0, 5).map((run) => (
        `<li><span class="tag">${escapeHtml(runStatusLabel(run.status))}</span>${escapeHtml(formatRunAt(run.at))}${run.contextSummary ? ` · ${escapeHtml(run.contextSummary)}` : ''}<p>${escapeHtml(run.result)}</p></li>`
      )).join('')}</ul>`
      : '';
    return `
      <section class="card" style="margin-top:14px">
        <div class="kicker">Routine</div>
        <h2>${escapeHtml(routine.name)}</h2>
        <p>${escapeHtml(routine.contextNote)}</p>
        <form method="POST" action="/ops/routines" class="task-row">
          <input type="hidden" name="action" value="update-routine"/>
          <input type="hidden" name="id" value="${escapeHtml(routine.id)}"/>
          <input type="hidden" name="returnTo" value="/ops/routines"/>
          <label for="routine-name-${escapeHtml(routine.id)}">Name</label>
          <input id="routine-name-${escapeHtml(routine.id)}" name="name" required maxlength="160" value="${escapeHtml(routine.name)}"/>
          <label for="routine-prompt-${escapeHtml(routine.id)}">Prompt</label>
          <textarea id="routine-prompt-${escapeHtml(routine.id)}" name="prompt" required maxlength="2000">${escapeHtml(routine.prompt)}</textarea>
          <label for="routine-note-${escapeHtml(routine.id)}">Needed context</label>
          <input id="routine-note-${escapeHtml(routine.id)}" name="contextNote" maxlength="400" value="${escapeHtml(routine.contextNote)}"/>
          <button class="btn btn-sm" type="submit">Save routine</button>
        </form>
        <p><button class="btn btn-sm" type="button" data-copy-target="#routine-prompt-${escapeHtml(routine.id)}">Copy prompt</button> The prompt box above is also selectable if clipboard is blocked.</p>
        <form method="POST" action="/ops/routines">
          <input type="hidden" name="action" value="run-routine"/>
          <input type="hidden" name="id" value="${escapeHtml(routine.id)}"/>
          <input type="hidden" name="returnTo" value="/ops/routines"/>
          <fieldset class="ctx">
            <legend>Context for this run</legend>
            ${store.goal
              ? `<label class="check"><input type="checkbox" name="useGoal" value="1" checked/> Goal — ${escapeHtml(store.goal.title)}</label>`
              : '<p class="empty">No current goal saved.</p>'}
            <label for="run-task-${escapeHtml(routine.id)}">Task (optional)</label>
            <select id="run-task-${escapeHtml(routine.id)}" name="taskId">
              ${option('', 'No task', true)}
              ${(store.tasks || []).map((task) => option(task.id, task.title, false)).join('')}
            </select>
            <label for="run-note-${escapeHtml(routine.id)}">Note</label>
            <select id="run-note-${escapeHtml(routine.id)}" name="noteId">
              ${option('', 'No note', true)}
              ${notes.map((note) => option(note.id, note.title, false)).join('')}
            </select>
          </fieldset>
          <button class="btn" type="submit">Run</button>
        </form>
        <div class="kicker" style="margin-top:16px">Last result</div>
        ${last}
        ${history}
      </section>`;
  }).join('');

  return shellPage({
    title: 'LAVAALL OS — Saved routines',
    email,
    area: 'routines',
    notice,
    error,
    scripts: '<script src="/assets/js/ops-copy.js" defer></script>',
    body: `
      ${persistenceBanner(snapshot.durable)}
      <h1>Saved routines</h1>
      <p>Reusable prompts. Edit, copy, or run manually. No background schedules and no auto-sends in v1.</p>
      <section class="card">
        <div class="kicker">Helper</div>
        <h2>Run status</h2>
        ${setupCard}
      </section>
      ${cards}
    `,
  });
}

function formatKitsSync(ts) {
  if (!ts) return 'never';
  return new Date(ts).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function kitsPage({ email, store, snapshot, notice, error, csrf, kitsSetup }) {
  const kits = listKits(store);
  const setup = kitsSetup || { sheetConfigured: false, sheetUrl: '' };
  const syncedAt = lastKitsSync(store);
  const openHref = setup.sheetUrl || '';
  const token = csrf || '';
  const rows = kits.map((kit) => {
    const statusClass = ` is-${String(kit.status || 'unknown').toLowerCase()}`;
    return `<tr class="kits-row" tabindex="0" data-kit="${escapeHtml(kit.kit_number)}" data-name="${escapeHtml(kit.person_name)}" data-status="${escapeHtml(kit.status)}" data-search="${escapeHtml(`${kit.kit_number} ${kit.person_name}`.toLowerCase())}" data-email="${escapeHtml(kit.email)}" data-notes="${escapeHtml(kit.notes)}" data-date="${escapeHtml(kit.date_added)}">
      <td class="kit-no">${escapeHtml(kit.kit_number)}</td>
      <td>${escapeHtml(kit.person_name)}</td>
      <td><span class="kit-status${statusClass}">${escapeHtml(kit.status)}</span></td>
      <td>${escapeHtml(kit.date_added || '—')}</td>
    </tr>`;
  }).join('');
  const empty = kits.length
    ? ''
    : '<p class="empty" id="kits-empty">No kits in mirror yet · Refresh or check Sheet</p>';
  const table = `<div class="kits-table-wrap">
        <table class="kits-table" id="kits-table">
          <thead>
            <tr>
              <th scope="col">Kit Number</th>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Date Added</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${empty}`;
  const chips = ['All'].concat(KIT_STATUSES).map((status, index) => (
    `<button type="button" data-status="${index === 0 ? '' : escapeHtml(status)}"${index === 0 ? ' class="is-on"' : ''}>${escapeHtml(status)}</button>`
  )).join('');
  const sheetLink = openHref
    ? `<a href="${escapeHtml(openHref)}" rel="noopener noreferrer" target="_blank">Open Sheet</a>`
    : '<span>Set KIT_REGISTRY_SHEET_ID to open the Sheet</span>';
  const setupHint = setup.sheetConfigured
    ? ''
    : '<p class="empty">Google Drive access is not connected yet. The last good mirror stays. Nothing is invented.</p>';

  return shellPage({
    title: 'LAVAALL OS — Kits',
    email,
    area: 'kits',
    notice,
    error,
    scripts: '<script src="/assets/js/ops-kits.js" defer></script>',
    body: `
      ${persistenceBanner(snapshot.durable)}
      <div class="kits-head">
        <div>
          <h1>Kits</h1>
          <p class="kits-sub">Sheet is source of truth</p>
        </div>
      </div>
      <div class="kits-banner">
        <span>Sheet is SoT · last sync ${escapeHtml(formatKitsSync(syncedAt))}</span>
        <form method="POST" action="/ops/api/kits/sync" id="kits-sync-form">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}"/>
          <input type="hidden" name="returnTo" value="/ops/kits"/>
          <button class="btn btn-sm" type="submit">Refresh</button>
        </form>
        ${sheetLink}
      </div>
      ${setupHint}
      <div class="kits-tools">
        <label class="visually-hidden" for="kits-search">Search name or kit number</label>
        <input id="kits-search" type="search" maxlength="200" placeholder="Search name or kit #"/>
        <div class="kits-chips" role="group" aria-label="Status">${chips}</div>
      </div>
      <div class="kits-layout" id="kits-layout">
        <section>
          <div id="kits-loading" hidden>
            <div class="kits-skel"></div>
            <div class="kits-skel"></div>
            <div class="kits-skel"></div>
          </div>
          ${table}
          <p class="kits-foot"><span id="kits-count">${kits.length} kits</span><span>read-only</span></p>
        </section>
        <aside class="kit-drawer" id="kit-drawer" hidden>
          <div class="kit-drawer-top">
            <div class="kicker">Kit detail</div>
            <button type="button" class="kit-drawer-close" id="kit-drawer-close" aria-label="Close kit detail">&times;</button>
          </div>
          <h2 id="kit-drawer-title">Select a row</h2>
          <p class="kit-drawer-name" id="kit-drawer-name"></p>
          <dl>
            <dt>Status</dt><dd id="kit-drawer-status"></dd>
            <dt>Date added</dt><dd id="kit-drawer-date"></dd>
            <dt>Email</dt><dd id="kit-drawer-email"></dd>
            <dt>Notes</dt><dd id="kit-drawer-notes"></dd>
          </dl>
          <p>${sheetLink}</p>
        </aside>
      </div>
    `,
  });
}

module.exports = { profilePage, tasksPage, memoryPage, chatPage, inboxPage, calendarPage, routinesPage, kitsPage };
