// pages/index.js - Simple page
export default function Home() {
  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>OmniChat API</h1>
      <p>API is running at <code>/api/*</code></p>
      <p>Endpoints:</p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        <li>GET /api/campaigns</li>
        <li>POST /api/campaigns</li>
        <li>GET /api/contacts</li>
        <li>GET /api/channels</li>
        <li>POST /api/auth/login</li>
      </ul>
    </div>
  );
}
