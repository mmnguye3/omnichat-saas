-- Migration: Add Super Admin & Invitation System
-- Run this in your Supabase SQL Editor

-- ============================================
-- SUPER ADMIN & INVITATION SYSTEM
-- ============================================

-- Super admins (system-wide admin access)
CREATE TABLE IF NOT EXISTS super_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admin invitations (sent by super admin)
CREATE TABLE IF NOT EXISTS admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES profiles(id),
  workspace_id UUID REFERENCES workspaces(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facebook pages connected by admins
CREATE TABLE IF NOT EXISTS facebook_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES profiles(id),
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, page_id)
);

-- Employee chat access (which conversations an employee can see)
CREATE TABLE IF NOT EXISTS employee_conversation_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, conversation_id)
);

-- Indexes for new tables
CREATE INDEX IF NOT EXISTS idx_admin_invitations_token ON admin_invitations(token);
CREATE INDEX IF NOT EXISTS idx_admin_invitations_email ON admin_invitations(email);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_workspace ON facebook_pages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_connected_by ON facebook_pages(connected_by);
CREATE INDEX IF NOT EXISTS idx_employee_conversation_access_employee ON employee_conversation_access(employee_id);

-- ============================================
-- MAKE YOURSELF SUPER ADMIN
-- ============================================
-- Replace 'YOUR_USER_ID' with your Supabase user ID
-- You can find your user ID in the auth.users table

-- INSERT INTO super_admins (user_id, email)
-- VALUES ('YOUR_USER_ID', 'your@email.com');
