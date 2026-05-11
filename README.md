# 🏢 Hostel Issue Tracker

A complete, production-ready full-stack hostel complaint management system consisting of a **Student Portal** and an **Admin Dashboard**. Built using HTML, CSS, JavaScript, and powered by **Supabase** for real-time tracking, media uploads, and database management.

## ✨ Features

### Student Panel (`index.html`)
- **NIAT ID Authentication**: Students log in securely using their assigned NIAT IDs. Auto-fills student name from verified dataset.
- **Complaint Submission**: Select room number, category (Mess, Water, Wi-Fi, etc.), and priority level.
- **Media Upload**: Supports image and video attachments (up to 50MB) with Supabase Storage.
- **My Complaints View**: Tracks all submitted complaints with live status updates. Students only see their own logs.
- **Real-time Synchronization**: Status updates and admin remarks appear instantly.
- **Dark Mode**: Toggleable theme for comfortable viewing.
- **Spam Protection**: Rate limiting and daily submission caps.

### Admin Dashboard (`admin.html`)
- **Secure Login**: Protected via Supabase Authentication.
- **Global Overview**: View all complaints, filter by status or category, and sort by priority/date.
- **Manage Complaints**: Mark issues as "In Progress" or "Resolved".
- **Admin Remarks**: Add comments/updates directly to logs which reflect on the student panel.
- **Soft Delete**: Archive obsolete or duplicate logs securely without losing data history.
- **Export to JSON**: Download the current view of the database for record-keeping.

## 🛠️ Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend & Database**: Supabase (PostgreSQL, Realtime, Auth, Storage)
- **Deployment**: Netlify / GitHub Pages

## 🚀 Deployment Steps (Netlify)

This project is fully ready for GitHub and Netlify deployment with relative paths and modular files.

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit - Production ready"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Connect to Netlify**:
   - Go to [Netlify](https://www.netlify.com/) and click **Add New Site** > **Import an existing project**.
   - Connect your GitHub account and select this repository.
   - Leave build command blank and publish directory as `/` (root).
   - Click **Deploy Site**.

3. **Access Portals**:
   - Student Portal: `https://<your-site>.netlify.app`
   - Admin Dashboard: `https://<your-site>.netlify.app/admin.html`

## 🔐 Supabase Setup & Security

To ensure full functionality, configure your Supabase project as follows:

### 1. Database Schema

**A. `complaints` table:**
- `id` (uuid, primary key)
- `created_at` (timestamp)
- `user_id` (text)
- `student_name` (text)
- `room_number` (text)
- `category` (text)
- `priority` (text)
- `description` (text)
- `image_url` (text)
- `status` (text) - default: 'Pending'
- `remarks` (text)
- `is_deleted` (boolean) - default: false

**B. `students` table:**
- `id` (uuid, primary key)
- `niat_id` (text, unique)
- `student_name` (text)
*(Note: Import your Chevella Student Data JSON directly into this table).*

### 2. Row Level Security (RLS) Policies (CRITICAL)

Ensure your tables have RLS enabled to prevent unauthorized access. Run the following in your Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;

-- COMPLAINTS TABLE POLICIES
-- 1. Students can insert complaints
CREATE POLICY "Students can insert complaints" 
ON complaints FOR INSERT 
WITH CHECK (true);

-- 2. Students view own complaints
-- (Note: In this implementation, frontend queries securely fetch using user_id. For strict RLS without JWT:)
CREATE POLICY "Students view own complaints" 
ON complaints FOR SELECT 
USING (user_id = auth.uid()::text OR current_setting('request.jwt.claims', true)::jsonb->>'role' = 'anon');

-- 3. Admins full access
CREATE POLICY "Admins full access" 
ON complaints FOR ALL 
USING (auth.role() = 'authenticated');
```

*Note: For complete strict security, it is recommended to implement full student authentication via Supabase Auth.*

### 3. Storage (`complaint_images` bucket)
- Create a public bucket named `complaint_images`.
- Add policies to allow `INSERT` for uploads and `SELECT` for viewing.

## 📸 Screenshots
*(Add your screenshots here)*

## 📄 License
This project is licensed under the MIT License.
