import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ewuhtrgpnmyejmuzeuvs.supabase.co';
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3dWh0cmdwbm15ZWptdXpldXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODk5NDEsImV4cCI6MjA4ODY2NTk0MX0.qlcd8sQtpdwHklwpyyBd3SH7PG6UT_Nf-SQsD97Fe4A';

const supabase = createClient(supabaseUrl, supabaseAnon);
const API = '';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/auth';
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      logout();
      return;
    }

    setUser(user);

    // Check if super admin
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    setIsSuperAdmin(!!superAdmin);

    // Load workspaces
    const res = await fetch('/api/workspaces', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setWorkspaces(data);
    
    if (data.length > 0) {
      setCurrentWorkspace(data[0].id);
    }
    
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth';
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      {/* Header */}
      <header style={{ background: 'white', padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '20px', color: '#1a1a2e' }}>💬 OmniChat</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#666' }}>{user?.email}</span>
          <button onClick={logout} style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Logout</button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
        {/* Workspace Selector */}
        {workspaces.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <label style={{ marginRight: '12px', fontWeight: '500' }}>Workspace:</label>
            <select 
              value={currentWorkspace} 
              onChange={(e) => setCurrentWorkspace(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px' }}
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name} ({ws.role})</option>
              ))}
            </select>
          </div>
        )}

        {/* No workspaces */}
        {workspaces.length === 0 && (
          <div style={{ background: 'white', padding: '40px', borderRadius: '12px', textAlign: 'center' }}>
            <h2>Welcome to OmniChat!</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>You don't have a workspace yet.</p>
            <CreateWorkspace onCreated={(id) => { setCurrentWorkspace(id); checkUser(); }} />
          </div>
        )}

        {/* Admin Panel */}
        {isSuperAdmin && (
          <div style={{ marginTop: '32px' }}>
            <h2 style={{ marginBottom: '16px' }}>👑 Super Admin</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <a href="/super-admin" style={{ background: 'white', padding: '24px', borderRadius: '12px', textDecoration: 'none', color: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>📧 Invite Admins</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Invite new admins via email</p>
              </a>
              <a href="/admin/facebook" style={{ background: 'white', padding: '24px', borderRadius: '12px', textDecoration: 'none', color: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>📘 Facebook Pages</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Connect Facebook pages</p>
              </a>
              <a href="/admin/team" style={{ background: 'white', padding: '24px', borderRadius: '12px', textDecoration: 'none', color: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 8px 0' }}>👥 Team & Access</h3>
                <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Manage employees & chat access</p>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateWorkspace({ onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function create(e) {
    e.preventDefault();
    setLoading(true);
    
    const token = localStorage.getItem('token');
    const { data: { user } } = await supabase.auth.getUser();
    
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, user_id: user.id })
    });
    
    const data = await res.json();
    onCreated(data.id);
    setLoading(false);
  }

  return (
    <form onSubmit={create} style={{ maxWidth: '400px', margin: '0 auto' }}>
      <input
        type="text"
        placeholder="Workspace Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        style={{ width: '100%', padding: '12px', marginBottom: '12px', border: '1px solid #ddd', borderRadius: '8px' }}
      />
      <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
        {loading ? 'Creating...' : 'Create Workspace'}
      </button>
    </form>
  );
}
