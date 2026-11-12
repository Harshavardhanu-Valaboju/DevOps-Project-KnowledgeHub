import React, { useEffect, useState } from 'react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(config => {
  if (localStorage.token) config.headers.Authorization = `Bearer ${localStorage.token}`;
  return config;
});

function SectionTitle({ eyebrow, title, description }) {
  return <><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</>;
}

function ActionButton({ children, onClick, secondary = false, disabled = false }) {
  return <button type="button" className={`button small ${secondary ? 'secondary' : ''}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function ActivityStats({ row }) {
  return <div className="activity-stats"><span><strong>{row.questions}</strong> questions</span><span><strong>{row.answers}</strong> answers</span><span><strong>{row.comments}</strong> comments</span><span><strong>{row.votes}</strong> votes</span><span><strong>{row.contributions}</strong> contributions</span></div>;
}

function UserDirectory({ users, admin, selectedUserId, onSelect, onRefresh, onError }) {
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' });
  const [showAdd, setShowAdd] = useState(false);

  const updateUser = async (id, update) => {
    try {
      await api.patch(`/admin/users/${id}`, update);
      onRefresh();
    } catch (error) {
      onError(error);
    }
  };

  const removeUser = async id => {
    if (!window.confirm('Remove this user from the application?')) return;
    try {
      await api.delete(`/admin/users/${id}`);
      onRefresh();
    } catch (error) {
      onError(error);
    }
  };

  const addUser = async event => {
    event.preventDefault();
    try {
      await api.post('/admin/users', newUser);
      setNewUser({ name: '', email: '', password: '', role: 'user' });
      setShowAdd(false);
      onRefresh();
    } catch (error) {
      onError(error);
    }
  };

  return <section className="panel">
    <div className="section-head">
      <div><h2>Community members</h2><p className="muted">Contribution details for every person in the application.</p></div>
      {admin && <ActionButton onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'Close form' : 'Add user'}</ActionButton>}
    </div>
    {admin && showAdd && <form className="inline-form" onSubmit={addUser}>
      <label>Name<input required value={newUser.name} onChange={event => setNewUser({ ...newUser, name: event.target.value })} /></label>
      <label>Email<input required type="email" value={newUser.email} onChange={event => setNewUser({ ...newUser, email: event.target.value })} /></label>
      <label>Password<input required minLength="8" type="password" value={newUser.password} onChange={event => setNewUser({ ...newUser, password: event.target.value })} /></label>
      <label>Role<select value={newUser.role} onChange={event => setNewUser({ ...newUser, role: event.target.value })}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select></label>
      <ActionButton>Add user</ActionButton>
    </form>}
    <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Questions</th><th>Answers</th><th>Comments</th><th>Votes given</th><th>Votes received</th><th>Contributions</th><th>Actions</th></tr></thead><tbody>
      {users.map(user => <tr key={user._id} className={selectedUserId === user._id ? 'selected-row' : ''}>
        <td>{user.name}<small className="table-subtitle">{user.active ? 'Active' : 'Removed'}</small></td>
        <td>{user.email}</td>
        <td>{admin ? <select value={user.role} disabled={!user.active} onChange={event => updateUser(user._id, { role: event.target.value })}><option value="user">User</option><option value="moderator">Moderator</option><option value="admin">Admin</option></select> : user.role}</td>
        <td>{user.questions}</td><td>{user.answers}</td><td>{user.comments}</td><td>{user.votes}</td><td>{user.votesReceived}</td><td>{user.contributions}</td>
        <td className="management-actions"><ActionButton secondary={selectedUserId !== user._id} onClick={() => onSelect(selectedUserId === user._id ? null : user._id)}>{selectedUserId === user._id ? 'Close activity' : 'View activity'}</ActionButton>{admin && (user.active ? <ActionButton onClick={() => removeUser(user._id)}>Remove</ActionButton> : <ActionButton secondary onClick={() => updateUser(user._id, { active: true })}>Restore</ActionButton>)}</td>
      </tr>)}
    </tbody></table>{!users.length && <div className="empty">No users found.</div>}</div>
  </section>;
}

function ContentWorkspace({ userId, onError }) {
  const [content, setContent] = useState({ questions: [], answers: [], comments: [] });
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tab, setTab] = useState('questions');
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = userId ? { userId } : {};
      const [contentResponse, historyResponse] = await Promise.all([
        api.get('/moderation/content', { params }),
        api.get('/moderation/history'),
      ]);
      setContent(contentResponse.data);
      setHistory(historyResponse.data);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);
  useEffect(() => { api.get('/categories').then(response => setCategories(response.data)).catch(() => {}); }, []);

  const startEditing = row => setEditing({
    type: tab.slice(0, -1),
    id: row._id,
    title: row.title || '',
    description: row.description || '',
    category: row.category?._id || row.category || '',
    tags: (row.tags || []).join(', '),
    content: row.content || '',
  });

  const saveEditing = async event => {
    event.preventDefault();
    try {
      const body = editing.type === 'question'
        ? { action: 'update', title: editing.title, description: editing.description, category: editing.category, tags: editing.tags.split(',').map(tag => tag.trim()).filter(Boolean), reason: 'Updated during moderation review' }
        : { action: 'update', content: editing.content, reason: 'Updated during moderation review' };
      await api.patch(`/moderation/content/${editing.type}/${editing.id}`, body);
      setEditing(null);
      load();
    } catch (error) {
      onError(error);
    }
  };

  const changeVisibility = async (type, id, action) => {
    try {
      await api.patch(`/moderation/content/${type}/${id}`, { action, reason: `${action} from the moderation workspace` });
      load();
    } catch (error) {
      onError(error);
    }
  };

  const deleteContent = async (type, id) => {
    if (!window.confirm('Delete this contribution? It can be restored using undo.')) return;
    try {
      await api.delete(`/moderation/content/${type}/${id}`);
      load();
    } catch (error) {
      onError(error);
    }
  };

  const undoRedo = async log => {
    try {
      await api.post(`/moderation/history/${log._id}/${log.undone ? 'redo' : 'undo'}`);
      load();
    } catch (error) {
      onError(error);
    }
  };

  const rows = content[tab] || [];
  const type = tab.slice(0, -1);

  return <section className="panel">
    <div className="section-head"><div><h2>{userId ? 'Selected member activity' : 'All community content'}</h2><p className="muted">Questions include their author and domain. Staff can update, hide, delete, restore, undo, and redo content.</p></div>{loading && <span className="pill">Loading...</span>}</div>
    <div className="report-toolbar management-tabs"><ActionButton secondary={tab !== 'questions'} onClick={() => { setTab('questions'); setEditing(null); }}>Questions</ActionButton><ActionButton secondary={tab !== 'answers'} onClick={() => { setTab('answers'); setEditing(null); }}>Answers</ActionButton><ActionButton secondary={tab !== 'comments'} onClick={() => { setTab('comments'); setEditing(null); }}>Comments</ActionButton></div>
    <div className="content-list">
      {rows.map(row => <article className="moderation-row content-row" key={row._id}>
        {editing?.id === row._id && editing.type === type ? <form className="content-editor" onSubmit={saveEditing}>
          {type === 'question' ? <><label>Question title<input required minLength="10" value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} /></label><label>Details<textarea required minLength="20" rows="4" value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })} /></label><label>Domain<select required value={editing.category} onChange={event => setEditing({ ...editing, category: event.target.value })}><option value="">Choose a category</option>{categories.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label><label>Tags<input value={editing.tags} onChange={event => setEditing({ ...editing, tags: event.target.value })} /></label></> : <label>Content<textarea required minLength="2" rows="4" value={editing.content} onChange={event => setEditing({ ...editing, content: event.target.value })} /></label>}
          <div className="management-actions"><ActionButton>Save update</ActionButton><ActionButton secondary onClick={() => setEditing(null)}>Cancel</ActionButton></div>
        </form> : <><div className="moderation-copy"><strong>{type === 'question' ? row.title : row.content}</strong><p>By {row.author?.name || 'Unknown user'}{type === 'question' && row.category?.name ? ` · Domain: ${row.category.name}` : ''}{type === 'answer' && row.question?.title ? ` · Question: ${row.question.title}` : ''}{type === 'comment' && row.target ? ` · On: ${row.target.title || row.target.question?.title || 'discussion'}` : ''}</p><small>{row.hidden ? 'Hidden/deleted' : 'Visible'} · {new Date(row.createdAt).toLocaleString()}</small></div><div className="management-actions"><ActionButton secondary onClick={() => startEditing(row)}>Update</ActionButton>{row.hidden ? <ActionButton onClick={() => changeVisibility(type, row._id, 'restore')}>Restore</ActionButton> : <ActionButton onClick={() => changeVisibility(type, row._id, 'hide')}>Hide</ActionButton>} {!row.hidden && <ActionButton onClick={() => deleteContent(type, row._id)}>Delete</ActionButton>}</div></>}
      </article>)}
      {!rows.length && <div className="empty">No content found.</div>}
    </div>
    <div className="history-block"><div className="section-head"><div><h3>Undo and redo history</h3><p className="muted">Every staff change stores its previous and next state.</p></div></div><div className="table-wrap"><table><thead><tr><th>Action</th><th>Content</th><th>Staff member</th><th>Time</th><th>Action</th></tr></thead><tbody>{history.map(log => <tr key={log._id}><td>{log.action}</td><td>{log.targetLabel}</td><td>{log.moderator?.name}</td><td>{new Date(log.createdAt).toLocaleString()}</td><td><ActionButton secondary onClick={() => undoRedo(log)} disabled={!log.before || !log.after}>{log.undone ? 'Redo' : 'Undo'}</ActionButton></td></tr>)}</tbody></table>{!history.length && <div className="empty">No moderation history yet.</div>}</div></div>
  </section>;
}

function ReportsPanel({ onError }) {
  const [reports, setReports] = useState([]);
  const load = () => api.get('/moderation/reports?status=pending').then(response => setReports(response.data)).catch(onError);
  useEffect(() => { load(); }, []);
  const resolve = async (id, hide) => {
    try {
      await api.patch(`/moderation/reports/${id}`, { status: 'resolved', resolution: hide ? 'Content hidden after review' : 'Reviewed without hiding', hide });
      load();
    } catch (error) {
      onError(error);
    }
  };
  return <section className="panel"><div className="section-head"><div><h2>Pending reports</h2><p className="muted">Reports are also recorded in the moderation history.</p></div><span className="pill">{reports.length} pending</span></div>{reports.map(report => <div className="moderation-row" key={report._id}><div><strong>{report.targetType}</strong><p>{report.reason}</p><small>Reported by {report.reporter?.name}</small></div><div className="management-actions"><ActionButton onClick={() => resolve(report._id, true)}>Hide content</ActionButton><ActionButton secondary onClick={() => resolve(report._id, false)}>Resolve</ActionButton></div></div>)}{!reports.length && <div className="empty">No pending reports.</div>}</section>;
}

function StaffWorkspace({ admin }) {
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [stats, setStats] = useState();
  const [error, setError] = useState('');

  const toMessage = error => setError(error.response?.data?.message || 'Could not load management data');
  const load = async () => {
    try {
      const [usersResponse, statsResponse] = await Promise.all([
        api.get('/moderation/users'),
        admin ? api.get('/admin/stats') : Promise.resolve({ data: null }),
      ]);
      setUsers(usersResponse.data);
      setStats(statsResponse.data);
    } catch (loadError) {
      toMessage(loadError);
    }
  };

  useEffect(() => { load(); }, []);

  return <section className="wide management"><SectionTitle eyebrow={admin ? 'ADMIN CONTROL CENTER' : 'MODERATION WORKSPACE'} title={admin ? 'Platform administration' : 'Community moderation'} description={admin ? 'Admins can manage users and all discussion content. Every content change has undo and redo support.' : 'Moderators can view member activity and update, hide, delete, restore, undo, and redo discussion content. Account creation and removal are restricted to admins.'} />{error && <div className="error">{error}</div>}{stats && <div className="stats">{Object.entries(stats).map(([key, value]) => <div className="stat" key={key}><strong>{value}</strong><span>{key}</span></div>)}</div>}<div className="management-grid"><UserDirectory users={users} admin={admin} selectedUserId={selectedUserId} onSelect={setSelectedUserId} onRefresh={load} onError={toMessage} /><ContentWorkspace userId={selectedUserId} onError={toMessage} /><ReportsPanel onError={toMessage} /></div></section>;
}

export function AdminPortal() {
  return <StaffWorkspace admin />;
}

export function ModeratorPortal() {
  return <StaffWorkspace admin={false} />;
}
