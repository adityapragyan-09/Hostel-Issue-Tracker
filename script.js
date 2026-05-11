// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let dbComplaints = [];
let studentRealtimeInitialized = false;

// ===== Student ID Management (NIAT ID) =====
async function getStudentId() {
  // Try to get from localStorage first, then sessionStorage as backup
  let id = localStorage.getItem('user_id') || sessionStorage.getItem('user_id');

  if (!id) {
    id = prompt("Enter your NIAT ID (e.g. NIAT001)");

    // Validation: At least 5 characters and must be in our dataset
    if (!id || id.trim().toUpperCase().length < 5) {
      alert("Please enter a valid NIAT ID");
      return await getStudentId(); // Re-prompt
    }
    
    const formattedId = id.trim().toUpperCase();
    
    const { data, error } = await supabaseClient
      .from('students')
      .select('"Student Full Name"')
      .eq('"NIAT ID"', formattedId)
      .single();

    if (error || !data) {
      alert("Invalid NIAT ID. Please contact the administrator.");
      return await getStudentId();
    }

    id = formattedId;
    const studentName = data["Student Full Name"];
    
    // Store permanently in localStorage and temporarily in sessionStorage
    localStorage.setItem('user_id', id);
    sessionStorage.setItem('user_id', id);
  } else {
    // If found in one but not the other, sync them
    if (!localStorage.getItem('user_id')) localStorage.setItem('user_id', id);
    if (!sessionStorage.getItem('user_id')) sessionStorage.setItem('user_id', id);
  }

  return id;
}

// ===== DOM Elements =====
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menuToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const darkToggle = document.getElementById('darkToggle');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');
const headerTitle = document.getElementById('headerTitle');
const headerSubtitle = document.getElementById('headerSubtitle');

// Form elements
const complaintForm = document.getElementById('complaintForm');
const submitBtn = document.getElementById('submitBtn');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileNameDisplay = document.getElementById('fileName');

// Complaints section elements
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const complaintsList = document.getElementById('complaintsList');

// Stats
const statTotal = document.getElementById('statTotal');
const statPending = document.getElementById('statPending');
const statProgress = document.getElementById('statProgress');
const statResolved = document.getElementById('statResolved');

// Toast
const toastContainer = document.getElementById('toastContainer');

// ===== Header Config =====
const headerConfig = {
  submit: { title: 'Submit Complaint', subtitle: 'Fill in the details below to report an issue' },
  complaints: { title: 'My Complaints', subtitle: 'View and track all your submitted complaints' },
  help: { title: 'Help & Support', subtitle: 'Contact hostel office or get assistance' }
};

// ===== Sidebar Toggle (Mobile) =====
menuToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
});

sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
});

// ===== Navigation =====
navItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionKey = item.dataset.section;

    // Update active nav
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    // Update sections
    sections.forEach(s => s.classList.remove('active'));
    const targetSection = document.getElementById('section' + capitalize(sectionKey));
    if (targetSection) targetSection.classList.add('active');

    // Update header
    const config = headerConfig[sectionKey];
    if (config) {
      headerTitle.textContent = config.title;
      headerSubtitle.textContent = config.subtitle;
    }

    // Refresh complaints if navigating to that section
    if (sectionKey === 'complaints') {
      renderComplaints();
      updateStats();
    }

    // Close mobile sidebar
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  });
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== Dark Mode =====
function initTheme() {
  const saved = localStorage.getItem('hostel-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

darkToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('hostel-theme', next);
});

initTheme();

// ===== File Upload =====
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = 'var(--primary)';
  uploadArea.style.background = 'var(--primary-glow)';
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.style.borderColor = '';
  uploadArea.style.background = '';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  uploadArea.style.background = '';
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect();
  }
});

fileInput.addEventListener('change', handleFileSelect);

function handleFileSelect() {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    if (file.size > 50 * 1024 * 1024) {
      showToast('File size must be under 50MB', 'error');
      fileInput.value = '';
      fileNameDisplay.textContent = '';
      return;
    }
    fileNameDisplay.textContent = '📎 ' + file.name;
  } else {
    fileNameDisplay.textContent = '';
  }
}

// ===== Simple Client-Side Firewall =====
function checkFirewall(description, name) {
  // 1. Anti-Spam: Rate limiting (1 complaint per 2 minutes)
  const lastSubmitTime = localStorage.getItem('last_submit_time');
  if (lastSubmitTime) {
    const timeDiff = Date.now() - parseInt(lastSubmitTime);
    if (timeDiff < 2 * 60 * 1000) {
      showToast('Firewall: Please wait 2 minutes before submitting another complaint to prevent spam.', 'error');
      return false;
    }
  }

  // 2. Anti-Spam: Daily Limit (Max 5 complaints per day)
  const today = new Date().toDateString();
  const dailySubmissions = JSON.parse(localStorage.getItem('daily_submissions') || '{}');
  if (dailySubmissions.date !== today) {
    dailySubmissions.date = today;
    dailySubmissions.count = 0;
  }

  if (dailySubmissions.count >= 5) {
    showToast('Firewall: Daily limit reached (Max 5 complaints/day). Try again tomorrow.', 'error');
    return false;
  }

  // 3. Basic XSS / Malicious Input check
  const maliciousPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|on\w+=|javascript:/gi;
  if (maliciousPattern.test(description) || maliciousPattern.test(name)) {
    showToast('Firewall: Malicious content blocked.', 'error');
    return false;
  }

  return true;
}

function recordFirewallSubmit() {
  localStorage.setItem('last_submit_time', Date.now().toString());

  const today = new Date().toDateString();
  const dailySubmissions = JSON.parse(localStorage.getItem('daily_submissions') || '{}');
  dailySubmissions.count = (dailySubmissions.count || 0) + 1;
  dailySubmissions.date = today;
  localStorage.setItem('daily_submissions', JSON.stringify(dailySubmissions));
}

// ===== Form Validation & Submission =====
complaintForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const description = document.getElementById('description').value;

  const isValid = await validateForm();
  const name = document.getElementById('studentName').value;

  if (isValid && checkFirewall(description, name)) {
    submitComplaint();
  }
});

async function validateForm() {
  let valid = true;

  const niatId = document.getElementById('niatId');
  const name = document.getElementById('studentName');
  const room = document.getElementById('roomNumber');
  const category = document.getElementById('category');
  const priority = document.getElementById('priority');
  const description = document.getElementById('description');

  // Reset errors
  clearErrors();

  const formattedId = niatId.value.trim().toUpperCase();
  if (formattedId.length < 5) {
    showError(niatId, 'errNiat');
    valid = false;
  } else {
    const { data, error } = await supabaseClient
      .from('students')
      .select('"Student Full Name"')
      .eq('"NIAT ID"', formattedId)
      .single();
      
    if (error || !data) {
      showError(niatId, 'errNiat');
      valid = false;
    } else {
      name.value = data["Student Full Name"];
    }
  }

  if (!room.value.trim()) {
    showError(room, 'errRoom');
    valid = false;
  }

  if (!category.value) {
    showError(category, 'errCategory');
    valid = false;
  }

  if (!priority.value) {
    showError(priority, 'errPriority');
    valid = false;
  }

  if (!description.value.trim()) {
    showError(description, 'errDesc');
    valid = false;
  }

  return valid;
}

function showError(input, errId) {
  input.classList.add('error');
  document.getElementById(errId).classList.add('show');
}

function clearErrors() {
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.error-msg').forEach(el => el.classList.remove('show'));
}

// Remove error styling on input
['niatId', 'roomNumber', 'category', 'priority', 'description'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    el.classList.remove('error');
    const errEl = el.parentElement.querySelector('.error-msg');
    if (errEl) errEl.classList.remove('show');
  });
  el.addEventListener('change', () => {
    el.classList.remove('error');
    const errEl = el.parentElement.querySelector('.error-msg');
    if (errEl) errEl.classList.remove('show');
  });
});

// Auto-fill student name
let debounceTimer;
document.getElementById('niatId').addEventListener('input', function () {
  clearTimeout(debounceTimer);
  const id = this.value.trim().toUpperCase();
  const nameField = document.getElementById('studentName');
  
  if (id.length < 5) {
    nameField.value = '';
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const { data, error } = await supabaseClient
        .from('students')
        .select('"Student Full Name"')
        .eq('"NIAT ID"', id)
        .single();
        
      if (data && !error) {
        nameField.value = data["Student Full Name"];
        nameField.classList.remove('error');
        document.getElementById('errNiat').classList.remove('show');
      } else {
        nameField.value = '';
      }
    } catch (e) {
      nameField.value = '';
    }
  }, 500);
});

// ===== Submit Complaint =====
async function submitComplaint() {
  const user_id = await getStudentId();
  if (!user_id) return;

  // Form Field Validation & Trimming
  const student_name = document.getElementById('studentName').value.trim();
  const room_number = document.getElementById('roomNumber').value.trim();
  const category = document.getElementById('category').value;
  const priority = document.getElementById('priority').value;
  const description = document.getElementById('description').value.trim();

  if (!student_name || !room_number || !category || !priority || !description) {
    alert("All fields are required");
    return;
  }

  // Show loading state
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="spinner"></span> Submitting...';

  try {
    // --- Image Upload Logic ---
    let imageUrl = null;
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `${fileName}`;

      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('complaint_images')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Image upload error:', uploadError);
        showToast('Image upload failed, submitting text only', 'error');
      } else {
        const { data: urlData } = supabaseClient.storage
          .from('complaint_images')
          .getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }
    }

    const newComplaint = {
      user_id: user_id,
      student_name: student_name,
      room_number: room_number,
      category: category,
      priority: priority,
      description: description,
      image_url: imageUrl,
      status: 'Pending',
      is_deleted: false,
      created_at: new Date()
    };

    const { data, error } = await supabaseClient
      .from('complaints')
      .insert([newComplaint]);

    if (error) {
      console.error('Supabase Error:', error);
      alert("Something went wrong. Please try again.");
      throw error;
    }

    recordFirewallSubmit();
    complaintForm.reset();
    fileNameDisplay.textContent = '';
    clearErrors();

    showToast(`Complaint submitted successfully!`, 'success');
    
    // 1. Open Success Message in a NEW Window/Tab
    window.open('success.html', '_blank');

    // 2. Refresh current page data and switch to "My Complaints"
    fetchComplaints();
    document.getElementById('navComplaints').click();

  } catch (err) {
    console.error(err);
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  }
}

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'HIT-';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ===== Delete Complaint (Soft Delete) =====
async function deleteComplaint(id) {
  if (!confirm('Are you sure you want to delete this complaint log?')) return;

  try {
    const { error } = await supabaseClient
      .from('complaints')
      .update({ is_deleted: true })
      .eq('id', id);

    if (error) {
      console.error(error);
      alert("Something went wrong. Please try again.");
      throw error;
    }

    showToast('Complaint log deleted successfully', 'success');
    fetchComplaints();
  } catch (err) {
    console.error(err);
  }
}

// ===== Supabase Fetch =====
async function fetchComplaints() {
  const user_id = await getStudentId();
  if (!user_id) return;

  try {
    const { data, error } = await supabaseClient
      .from('complaints')
      .select('*')
      .eq('user_id', user_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase Error:', error);
      alert("Something went wrong. Please try again.");
      throw error;
    }

    dbComplaints = data.map(c => ({
      real_id: c.id,
      id: String(c.id).substring(0, 8),
      name: c.student_name,
      room: c.room_number,
      category: c.category,
      priority: c.priority,
      description: c.description,
      image_url: c.image_url,
      status: c.status,
      remarks: c.remarks,
      date: c.created_at
    }));

    updateStats();
    renderComplaints();
  } catch (err) {
    console.error(err);
  }
}

function getComplaints() {
  return dbComplaints;
}

// ===== Render Complaints =====
function renderComplaints() {
  const complaints = getComplaints();
  const query = searchInput.value.trim().toUpperCase();
  const statusFilter = filterStatus.value;

  let filtered = complaints;

  // Search by ID
  if (query) {
    filtered = filtered.filter(c => c.id.toUpperCase().includes(query));
  }

  // Filter by status
  if (statusFilter !== 'all') {
    filtered = filtered.filter(c => c.status === statusFilter);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    complaintsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No complaints found</h3>
        <p>${query || statusFilter !== 'all' ? 'Try adjusting your search or filter' : 'You haven\'t submitted any complaints yet'}</p>
      </div>
    `;
    return;
  }

  complaintsList.innerHTML = filtered.map(c => createComplaintCard(c)).join('');
}

function createComplaintCard(c) {
  const date = new Date(c.date);
  const dateStr = date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const statusClass = c.status === 'Pending' ? 'pending'
    : c.status === 'In Progress' ? 'in-progress'
      : 'resolved';

  const priorityClass = c.priority.toLowerCase();

  const categoryIcons = {
    'Mess': '🍽️', 'Water': '💧', 'Wi-Fi': '📶',
    'Electricity': '⚡', 'Cleanliness': '🧹',
    'Plumbing': '🔧', 'Other': '📦'
  };

  return `
    <div class="complaint-card">
      <div class="card-top">
        <span class="card-id">${c.id}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <span class="status-badge ${statusClass}">${c.status}</span>
          ${c.status === 'Resolved' ? `<button onclick="deleteComplaint('${c.real_id}')" style="background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 0 4px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="Delete log">🗑️</button>` : ''}
        </div>
      </div>
      <div class="card-body">
        <h4>${categoryIcons[c.category] || '📦'} ${c.category} Issue</h4>
        <p class="description">${escapeHtml(c.description)}</p>
        ${c.image_url ? `
          <div class="attachment-link">
            <a href="${c.image_url}" target="_blank" class="view-btn">
              ${c.image_url.match(/\.(mp4|webm|ogg)$/i) ? '🎥 View Video Attachment' : '🖼️ View Image Attachment'}
            </a>
          </div>
        ` : ''}
        ${c.remarks ? `
          <div class="remarks-box" style="margin-top: 15px; padding: 12px; background: rgba(99, 102, 241, 0.1); border-left: 4px solid var(--primary); border-radius: 4px;">
            <strong style="color: var(--primary); font-size: 0.85rem; text-transform: uppercase;">Admin Remarks:</strong>
            <p style="margin-top: 5px; font-size: 0.95rem; color: var(--text-primary);">${escapeHtml(c.remarks)}</p>
          </div>
        ` : ''}
      </div>
      <div class="card-meta">
        <div class="meta-item">
          <span class="icon">🏠</span>
          <span>Room ${escapeHtml(c.room)}</span>
        </div>
        <div class="meta-item">
          <span class="icon">👤</span>
          <span>${escapeHtml(c.name)}</span>
        </div>
        <div class="meta-item">
          <span class="icon">📅</span>
          <span>${dateStr}, ${timeStr}</span>
        </div>
        <div class="meta-item">
          <span class="priority-badge ${priorityClass}">${c.priority}</span>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== Update Stats =====
function updateStats() {
  const complaints = getComplaints();
  const total = complaints.length;
  const pending = complaints.filter(c => c.status === 'Pending').length;
  const progress = complaints.filter(c => c.status === 'In Progress').length;
  const resolved = complaints.filter(c => c.status === 'Resolved').length;

  animateCounter(statTotal, total);
  animateCounter(statPending, pending);
  animateCounter(statProgress, progress);
  animateCounter(statResolved, resolved);
}

function animateCounter(el, target) {
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const duration = 500;
  const step = (target - current) / (duration / 16);
  let value = current;

  const timer = setInterval(() => {
    value += step;
    if ((step > 0 && value >= target) || (step < 0 && value <= target)) {
      el.textContent = target;
      clearInterval(timer);
    } else {
      el.textContent = Math.round(value);
    }
  }, 16);
}

// ===== Toast Notification =====
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✅' : '⚠️'}</span>
    <span>${message}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ===== Search & Filter =====
searchInput.addEventListener('input', renderComplaints);
filterStatus.addEventListener('change', renderComplaints);

function setupRealtime(user_id) {
  if (studentRealtimeInitialized) return;

  studentRealtimeInitialized = true;

  supabaseClient
    .channel('student-updates')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'complaints',
        filter: `user_id=eq.${user_id}`
      },
      (payload) => {
        console.log('Real-time update received:', payload);
        fetchComplaints(); // Refresh UI instantly
      }
    )
    .subscribe();
}

// ===== Init =====
async function init() {
  // Ensure ID exists before doing anything
  const user_id = await getStudentId();
  if (!user_id) return;

  // 1. Initial Load
  fetchComplaints();

  // 2. Setup Instant Real-Time Updates
  setupRealtime(user_id);

  // 3. Fallback Auto-refresh (every 60 seconds)
  setInterval(fetchComplaints, 60000);
}

init();
