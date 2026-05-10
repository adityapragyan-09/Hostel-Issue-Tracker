// Admin Authentication and State Management
// Hardcoded password REMOVED for security - Using Supabase Auth instead.

// --- SUPABASE CONFIGURATION ---
const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State variables
let complaintsData = [];
let deleteTargetId = null;
let adminRealtimeInitialized = false;

// DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const dashboard = document.getElementById('dashboard');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const backBtn = document.getElementById('back-btn');
const authError = document.getElementById('auth-error');
const datetimeDisplay = document.getElementById('datetime-display');
const themeToggle = document.getElementById('theme-toggle');
const exportBtn = document.getElementById('export-btn');
const tableBody = document.getElementById('table-body');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const filterStatus = document.getElementById('filter-status');
const filterCategory = document.getElementById('filter-category');
const sortSelect = document.getElementById('sort-select');
const deleteModal = document.getElementById('delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete');
const cancelDeleteBtn = document.getElementById('cancel-delete');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    updateDateTime();
    setInterval(updateDateTime, 60000);

    // Initial Auth Check
    checkAuth();

    // Auth Event Listeners
    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    // Check enter key on email too
    document.getElementById('admin-email').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    backBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Dashboard Event Listeners
    themeToggle.addEventListener('click', toggleTheme);
    searchInput.addEventListener('input', renderTable);
    filterStatus.addEventListener('change', renderTable);
    filterCategory.addEventListener('change', renderTable);
    sortSelect.addEventListener('change', renderTable);
    exportBtn.addEventListener('click', exportToJSON);
    
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Modal Event Listeners
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    confirmDeleteBtn.addEventListener('click', executeDelete);

    // Password Toggle Logic
    const togglePassword = document.getElementById('toggle-password');
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        
        // Toggle the icon
        togglePassword.classList.toggle('fa-eye');
        togglePassword.classList.toggle('fa-eye-slash');
    });
});

// Authentication
async function checkAuth() {
    const { data } = await supabaseClient.auth.getUser();

    if (data.user) {
        authOverlay.classList.add('hidden');
        dashboard.classList.remove('hidden');
        loadData();
        setupAdminRealtime();
    } else {
        authOverlay.classList.remove('hidden');
        dashboard.classList.add('hidden');
    }
}

async function handleLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value.trim();

    if (!email || !password) {
        authError.textContent = 'Enter email and password';
        return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Authenticating...';

    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        console.error('Login Error:', error);
        authError.textContent = 'Invalid credentials. Please try again.';
        passwordInput.value = '';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        setTimeout(() => { authError.textContent = ''; }, 3000);
    } else {
        // Login success
        authOverlay.classList.add('hidden');
        dashboard.classList.remove('hidden');
        loadData();
        setupAdminRealtime();
    }
}

async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        await supabaseClient.auth.signOut();
        window.location.reload();
    }
}

// Data Handling (Supabase Integration)
async function loadData() {
    try {
        // Fetch all records from the 'complaints' table
        const { data, error } = await supabaseClient
            .from('complaints')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase Error:', error);
            alert("Something went wrong. Please try again.");
            return;
        }

        if (data) {
            // Map Supabase columns to our app's format
            complaintsData = data.map(item => ({
                id: item.id,
                name: item.student_name,
                room: item.room_number,
                category: item.category,
                priority: item.priority,
                description: item.description,
                image_url: item.image_url,
                date: item.created_at,
                status: item.status,
                remarks: item.remarks,
                is_deleted: item.is_deleted
            }));
        } else {
            complaintsData = [];
        }

    } catch (err) {
        console.error("Supabase Error:", err);
        alert("Something went wrong. Please try again.");
    }

    updateSummaryCards();
    renderTable();
}

async function updateStatusInDB(id, newStatus) {
    const { error } = await supabaseClient
        .from('complaints')
        .update({ status: newStatus })
        .eq('id', id);

    if (error) {
        console.error('Supabase Error:', error);
        alert("Something went wrong. Please try again.");
        return false;
    }
    return true;
}

async function deleteFromDB(id) {
    const { error } = await supabaseClient
        .from('complaints')
        .update({ is_deleted: true })
        .eq('id', id);

    if (error) {
        console.error('Supabase Error:', error);
        alert("Something went wrong. Please try again.");
        return false;
    }
    return true;
}

window.saveRemarks = async function (id) {
    const remarksInput = document.getElementById(`remarks-${id}`);
    const remarksValue = remarksInput.value.trim();

    const { error } = await supabaseClient
        .from('complaints')
        .update({ remarks: remarksValue })
        .eq('id', id);

    if (error) {
        console.error('Supabase Error:', error);
        alert("Failed to save remarks. Please try again.");
        return;
    }

    // Update local data
    const index = complaintsData.findIndex(c => c.id === id);
    if (index !== -1) complaintsData[index].remarks = remarksValue;

    alert("Remarks saved successfully!");
}

// --- ADMIN REAL-TIME ---
function setupAdminRealtime() {
    if (adminRealtimeInitialized) return;
    adminRealtimeInitialized = true;

    supabaseClient
        .channel('admin-updates')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'complaints'
            },
            (payload) => {
                console.log('Admin: Real-time update received', payload);
                loadData(); // Refresh the entire list when ANY student submits/deletes
            }
        )
        .subscribe();
}

// Rendering
function renderTable() {
    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = filterStatus.value;
    const categoryFilter = filterCategory.value;
    const sortMethod = sortSelect.value;

    let filtered = complaintsData.filter(c => {
        const matchesSearch =
            (c.name && c.name.toLowerCase().includes(searchTerm)) ||
            (c.room && c.room.toLowerCase().includes(searchTerm)) ||
            (c.id && c.id.toLowerCase().includes(searchTerm));

        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        const matchesCategory = categoryFilter === 'all' || c.category === categoryFilter;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    // Sorting
    filtered.sort((a, b) => {
        const dateA = new Date(a.date).getTime() || 0;
        const dateB = new Date(b.date).getTime() || 0;

        if (sortMethod === 'newest') {
            return dateB - dateA;
        } else if (sortMethod === 'oldest') {
            return dateA - dateB;
        } else if (sortMethod === 'priority') {
            const pVals = { 'High': 3, 'Medium': 2, 'Low': 1 };
            const pA = pVals[a.priority] || 0;
            const pB = pVals[b.priority] || 0;
            if (pA !== pB) return pB - pA; // Higher priority first
            return dateB - dateA; // fallback to newest
        }
    });

    tableBody.innerHTML = '';

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        filtered.forEach(c => {
            const tr = document.createElement('tr');

            // Format status for CSS class
            const statusClass = 'status-' + (c.status || 'Pending').replace(' ', '-');
            const priorityClass = 'priority-' + (c.priority || 'low').toLowerCase();

            // Format date nicely
            let formattedDate = c.date;
            try {
                if (c.date) {
                    const d = new Date(c.date);
                    formattedDate = d.toLocaleString();
                }
            } catch (e) { }

            tr.innerHTML = `
                <td data-label="ID"><span class="complaint-id">#${String(c.id).substring(0, 6)}</span></td>
                <td data-label="Student Name">${c.name || 'Unknown'}</td>
                <td data-label="Room Number">${c.room || '-'}</td>
                <td data-label="Category">${c.category || '-'}</td>
                <td data-label="Priority">
                    <span class="${priorityClass}">${c.priority || 'Low'}</span>
                    ${c.image_url ? '<i class="fa-solid fa-camera" style="margin-left: 8px; color: var(--primary); font-size: 0.8rem;" title="Has Attachment"></i>' : ''}
                </td>
                <td data-label="Description">
                    <div class="desc-text" title="${c.description || ''}">${c.description || '-'}</div>
                    ${c.image_url ? `
                        <div class="image-preview" style="margin-top: 8px;">
                            <a href="${c.image_url}" target="_blank">
                                <img src="${c.image_url}" alt="Attachment" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                            </a>
                        </div>
                    ` : ''}
                </td>
                <td data-label="Date & Time">${formattedDate || '-'}</td>
                <td data-label="Remarks">
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="remarks-${c.id}" value="${c.remarks || ''}" placeholder="Add remarks..." style="padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.85rem; width: 120px;">
                        <button onclick="saveRemarks('${c.id}')" style="padding: 6px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-save"></i></button>
                    </div>
                </td>
                <td data-label="Status"><span class="badge ${statusClass}">${c.status || 'Pending'}</span></td>
                <td data-label="Actions">
                    <div class="action-btns">
                        <button class="btn-icon btn-resolve" onclick="updateStatus('${c.id}', 'Resolved')" title="Mark Resolved" ${c.status === 'Resolved' ? 'disabled' : ''}>
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="btn-icon btn-progress" onclick="updateStatus('${c.id}', 'In Progress')" title="Mark In Progress" ${c.status === 'In Progress' ? 'disabled' : ''}>
                            <i class="fa-solid fa-spinner"></i>
                        </button>
                        <button class="btn-icon btn-delete" onclick="promptDelete('${c.id}')" title="Delete Complaint">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

function updateSummaryCards() {
    const total = complaintsData.length;
    const pending = complaintsData.filter(c => c.status === 'Pending').length;
    const progress = complaintsData.filter(c => c.status === 'In Progress').length;
    const resolved = complaintsData.filter(c => c.status === 'Resolved').length;
    const high = complaintsData.filter(c => c.priority === 'High' && c.status !== 'Resolved').length;

    document.getElementById('count-total').textContent = total;
    document.getElementById('count-pending').textContent = pending;
    document.getElementById('count-progress').textContent = progress;
    document.getElementById('count-resolved').textContent = resolved;
    document.getElementById('count-high').textContent = high;
}

// Actions
window.updateStatus = async function (id, newStatus) {
    const index = complaintsData.findIndex(c => c.id === id);
    if (index !== -1) {
        // Optimistic UI Update (Update instantly so the user doesn't wait)
        const oldStatus = complaintsData[index].status;
        complaintsData[index].status = newStatus;
        updateSummaryCards();
        renderTable();

        // Database Update
        const success = await updateStatusInDB(id, newStatus);

        if (!success) {
            // Revert changes if DB update fails
            complaintsData[index].status = oldStatus;
            updateSummaryCards();
            renderTable();
        }
    }
}

window.promptDelete = function (id) {
    deleteTargetId = id;
    deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
    deleteTargetId = null;
    deleteModal.classList.add('hidden');
}

window.executeDelete = async function () {
    if (deleteTargetId) {
        const idToDelete = deleteTargetId;
        closeDeleteModal();

        // Backup data for revert
        const backupData = [...complaintsData];

        // Optimistic UI Update
        complaintsData = complaintsData.filter(c => c.id !== idToDelete);
        updateSummaryCards();
        renderTable();

        // Database Update
        const success = await deleteFromDB(idToDelete);

        if (!success) {
            // Revert on failure
            complaintsData = backupData;
            updateSummaryCards();
            renderTable();
        }
    }
}

// Utilities
function updateDateTime() {
    const now = new Date();
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    datetimeDisplay.textContent = now.toLocaleDateString('en-US', options);
}

function initTheme() {
    const savedTheme = localStorage.getItem('admin_theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.removeAttribute('data-theme');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
}

function toggleTheme() {
    if (document.body.getAttribute('data-theme') === 'dark') {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('admin_theme', 'light');
        themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('admin_theme', 'dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }
}

function exportToJSON() {
    const dataStr = JSON.stringify(complaintsData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = 'hostel_complaints_' + new Date().toISOString().split('T')[0] + '.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}
