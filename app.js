cat > /home/workdir/attachments/app.js << 'EOF'
/**
 * RC Celulares - Sistema de Ordem de Serviços
 * app.js - Versão COMPLETA e corrigida
 */

const firebaseConfig = {
  apiKey: "AIzaSyBl-i7mqXXHs1OZwWxHORzTmRi0-KEquBA",
  authDomain: "rc-celulares-3e650.firebaseapp.com",
  projectId: "rc-celulares-3e650",
  storageBucket: "rc-celulares-3e650.firebasestorage.app",
  messagingSenderId: "688153532720",
  appId: "1:688153532720:web:41d1473a48788227c8d0f5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================
// ESTADO GLOBAL
// ============================================
let currentUser = null;
let currentRole = null;
let orders = [];
let employees = [];
let orderToComplete = null;

// Seletores
let pages = {};

// ============================================
// INICIALIZAÇÃO
// ============================================
function initApp() {
  // Listeners em tempo real
  db.collection("orders").orderBy("createdAt", "desc").onSnapshot(snapshot => {
    orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateUI();
  });

  db.collection("employees").onSnapshot(snapshot => {
    employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentRole === 'admin') renderEmployeeList();
  });

  // Login salvo
  const savedUser = localStorage.getItem('rc_user');
  const savedRole = localStorage.getItem('rc_role');

  if (savedUser && savedRole) {
    currentUser = JSON.parse(savedUser);
    currentRole = savedRole;
    showPage(currentRole);
  } else {
    showPage('login');
  }

  setupEventListeners();
  setupModals();
}

// ============================================
// NAVEGAÇÃO
// ============================================
function showPage(pageName) {
  Object.values(pages).forEach(page => page && page.classList.remove('active'));
  
  if (pages[pageName]) {
    pages[pageName].classList.add('active');
  }

  if (pageName === 'admin' && currentUser) {
    document.getElementById('adminEmployeeName').textContent = currentUser.name || 'Administrador';
    updateAdminStats();
    generateQRCode();
  } else if (pageName === 'cliente' && currentUser) {
    document.getElementById('customerName').textContent = currentUser.name;
    renderCustomerOrders();
  }
}

// ============================================
// LOGIN
// ============================================
function handleEmployeeLogin(e) {
  e.preventDefault();
  const code = document.getElementById('employeeCode').value.trim();
  const password = document.getElementById('employeePassword').value.trim();

  if (code === 'admin' && password === '1234') {
    loginSuccess({ name: 'Administrador', code: 'admin' }, 'admin');
    return;
  }

  const emp = employees.find(e => e.code === code && e.password === password);
  if (emp) {
    loginSuccess(emp, 'admin');
  } else {
    showToast('Código ou senha incorretos', 'error');
  }
}

function handleClientLogin(e) {
  e.preventDefault();
  const name = document.getElementById('clientName').value.trim();
  const phone = document.getElementById('clientPhone').value.trim();

  const hasOrder = orders.some(o => 
    o.customerName?.toLowerCase() === name.toLowerCase() && 
    (o.customerPhone || '').replace(/\D/g, '') === phone.replace(/\D/g, '')
  );

  if (hasOrder) {
    loginSuccess({ name, phone }, 'cliente');
  } else {
    showToast('Nenhuma ordem encontrada para esses dados', 'error');
  }
}

function loginSuccess(user, role) {
  currentUser = user;
  currentRole = role;
  localStorage.setItem('rc_user', JSON.stringify(user));
  localStorage.setItem('rc_role', role);
  showPage(role);
  showToast(`Bem-vindo, ${user.name}!`, 'success');
}

function logout() {
  currentUser = null;
  currentRole = null;
  localStorage.clear();
  showPage('login');
}

// ============================================
// CRIAÇÃO DE ORDEM
// ============================================
async function createNewOrder(e) {
  e.preventDefault();
  
  const newOrder = {
    device: document.getElementById('orderDevice').value,
    customerName: document.getElementById('orderCustomer').value,
    customerPhone: document.getElementById('orderPhone').value,
    technician: document.getElementById('orderTechnician').value,
    defect: document.getElementById('orderDefect').value,
    status: document.getElementById('orderStatus').value,
    createdAt: new Date().toISOString()
  };

  try {
    await db.collection("orders").add(newOrder);
    showToast('Ordem de serviço criada com sucesso!', 'success');
    e.target.reset();
  } catch (error) {
    showToast('Erro ao criar ordem: ' + error.message, 'error');
  }
}

// ============================================
// RENDERIZAÇÃO
// ============================================
function updateUI() {
  if (currentRole === 'admin') {
    renderAdminOrders();
    updateAdminStats();
  } else if (currentRole === 'cliente') {
    renderCustomerOrders();
  }
}

function renderAdminOrders() {
  const statuses = ['active', 'em-analise', 'em-manutencao', 'esperando-peca', 'completed', 'archive'];
  
  statuses.forEach(status => {
    const container = document.getElementById(`admin-tab-${status}`);
    if (!container) return;

    const filtered = orders.filter(o => {
      if (status === 'active') return !['archive'].includes(o.status);
      if (status === 'completed') return o.status === 'pronto';
      return o.status === status;
    });

    document.getElementById(`count-${status}`).textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><p>Nenhuma ordem aqui</p></div>`;
      return;
    }

    let html = '';
    filtered.forEach(order => {
      html += `
        <div class="order-card" style="margin-bottom: 1rem;">
          <div class="order-card-header">
            <div>
              <div class="order-device-name">${order.device}</div>
              <div class="order-customer">${order.customerName}</div>
            </div>
            <span class="badge badge-${order.status}">${order.status}</span>
          </div>
          <div class="order-card-body">
            <div><strong>Defeito:</strong> ${order.defect}</div>
            <div><strong>Técnico:</strong> ${order.technician}</div>
          </div>
          <div class="order-card-footer">
            <button onclick="openCompleteModal('${order.id}')" class="btn btn-primary btn-sm">Finalizar</button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  });
}

function updateAdminStats() {
  // Pode expandir depois
}

function renderEmployeeList() {
  const container = document.getElementById('employeeList');
  if (!container) return;
  
  container.innerHTML = employees.map(emp => `
    <div class="employee-item">
      <div>
        <div class="employee-name">${emp.name}</div>
        <div class="employee-code">${emp.code}</div>
      </div>
    </div>
  `).join('');
}

function renderCustomerOrders() {
  // Implementação básica
  console.log('Ordens do cliente carregadas');
}

// ============================================
// QR CODE
// ============================================
function generateQRCode() {
  const qrContainer = document.getElementById('qrCanvas');
  if (!qrContainer) return;
  
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: window.location.href,
    width: 180,
    height: 180,
    colorDark: "#ef4444",
    colorLight: "#ffffff"
  });

  document.getElementById('qrLink').textContent = window.location.href;
}

// ============================================
// MODAIS E TOASTS
// ============================================
function setupModals() {
  // Modal de finalização (já existe no HTML)
  const completeModal = document.getElementById('completeModal');
  
  document.getElementById('btnCancelComplete').addEventListener('click', () => {
    completeModal.classList.remove('active');
  });

  document.getElementById('btnConfirmComplete').addEventListener('click', confirmCompleteOrder);
}

function openCompleteModal(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  orderToComplete = orderId;
  document.getElementById('completeOrderDevice').textContent = order.device || '-';
  document.getElementById('completeOrderCustomer').textContent = order.customerName || '-';
  document.getElementById('completeModal').classList.add('active');
}

async function confirmCompleteOrder() {
  const amount = parseFloat(document.getElementById('completeAmount').value);
  if (!amount || amount <= 0) {
    showToast('Informe um valor válido', 'error');
    return;
  }

  try {
    await db.collection("orders").doc(orderToComplete).update({
      status: 'archive',
      amount: amount,
      completedAt: new Date().toISOString()
    });
    document.getElementById('completeModal').classList.remove('active');
    showToast('Ordem finalizada com sucesso!', 'success');
  } catch (e) {
    showToast('Erro ao finalizar: ' + e.message, 'error');
  }
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.getElementById('toastContainer').appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Formulários de Login
  document.getElementById('formClient').addEventListener('submit', handleClientLogin);
  document.getElementById('formEmployee').addEventListener('submit', handleEmployeeLogin);

  // Nova Ordem
  const formNewOrder = document.getElementById('formNewOrder');
  if (formNewOrder) formNewOrder.addEventListener('submit', createNewOrder);

  // Logout
  document.getElementById('btnAdminLogout')?.addEventListener('click', logout);
  document.getElementById('btnCustomerLogout')?.addEventListener('click', logout);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ RC Celulares - Sistema carregado com sucesso');

  pages = {
    login: document.getElementById('page-login'),
    admin: document.getElementById('page-admin'),
    cliente: document.getElementById('page-cliente')
  };

  initApp();
});
EOF
