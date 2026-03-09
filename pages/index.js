// Frontend wrapper for OmniChat
// This serves the static frontend when deployed to Vercel

export default function handler(req, res) {
  res.status(200).send(`
<!DOCTYPE html>
<html>
<head>
  <title>OmniChat API</title>
</head>
<body>
  <h1>OmniChat API</h1>
  <p>API is running. Connect frontend to /api/* endpoints.</p>
</body>
</html>
  `);
}
