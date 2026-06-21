/**
 * RC Celulares - Sistema de Ordem de Serviços
 * app.js - Versão corrigida
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

// Seletores de páginas (serão preenchidos após o DOM carregar)
let pages = {};

// ============================================
// INICIALIZAÇÃO
// ============================================
function initApp() {
  // Listener em tempo real das ordens
  db.collection("orders").orderBy("createdAt", "desc").onSnapshot(snapshot => {
    orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateUI();
  });

  // Listener dos funcionários
  db.collection("employees").onSnapshot(snapshot => {
    employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentRole === 'admin') renderEmployeeList();
  });

  // Verificar login salvo
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
// NAVEGAÇÃO ENTRE PÁGINAS
// ============================================
function showPage(pageName) {
  Object.values(pages).forEach(page => {
    if (page) page.classList.remove('active');
  });

  if (pages[pageName]) {
    pages[pageName].classList.add('active');
  }

  if (pageName === 'admin' && currentUser) {
    document.getElementById('adminEmployeeName').textContent = currentUser.name || 'Administrador';
    updateAdminStats();
    generateQRCode();
  } else if (pageName === 'cliente' && currentUser) {
    document.getElementById('customerName').textContent = currentUser.name;
  }
}

// ============================================
// LOGIN
// ============================================
async function handleEmployeeLogin(e) {
  e.preventDefault();
  const code = document.getElementById('employeeCode').value.trim();
  const password = document.getElementById('employeePassword').value.trim();

  if (code === 'admin' && password === 'Edj54kgc001') {
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
    o.customerName.toLowerCase() === name.toLowerCase() && 
    o.customerPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')
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
// MODAIS (Finalização + Recibo)
// ============================================
function setupModals() {
  const completeModal = document.getElementById('completeModal');
  const receiptModal = document.getElementById('receiptModal');
  const paymentOptions = document.getElementById('paymentOptions');

  // Renderizar formas de pagamento
  const paymentMethods = [
    { value: "pix", label: "PIX" },
    { value: "credito", label: "Cartão de Crédito" },
    { value: "debito", label: "Cartão de Débito" },
    { value: "especie", label: "Em Espécie" },
    { value: "crediario", label: "Crediário" }
  ];

  paymentOptions.innerHTML = paymentMethods.map(pm => `
    <label class="payment-option">
      <input type="radio" name="paymentMethod" value="${pm.value}" ${pm.value === 'pix' ? 'checked' : ''}>
      <span>${pm.label}</span>
    </label>
  `).join('');

  // Cancelar finalização
  document.getElementById('btnCancelComplete').addEventListener('click', () => {
    completeModal.classList.remove('active');
  });

  // Confirmar finalização
  document.getElementById('btnConfirmComplete').addEventListener('click', confirmCompleteOrder);

  // Fechar recibo
  document.getElementById('btnCloseReceipt').addEventListener('click', () => {
    receiptModal.classList.remove('active');
  });
}

function openCompleteModal(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  orderToComplete = orderId;
  document.getElementById('completeOrderDevice').textContent = order.device;
  document.getElementById('completeOrderCustomer').textContent = order.customerName;
  document.getElementById('completeModal').classList.add('active');
  document.getElementById('completeAmount').focus();
}

async function confirmCompleteOrder() {
  const amount = parseFloat(document.getElementById('completeAmount').value);
  const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;

  if (!amount || amount <= 0) {
    showToast('Informe um valor válido', 'error');
    return;
  }
  if (!paymentMethod) {
    showToast('Selecione uma forma de pagamento', 'error');
    return;
  }

  try {
    await db.collection("orders").doc(orderToComplete).update({
      status: 'archive',
      amount: amount,
      paymentMethod: paymentMethod,
      completedAt: new Date().toISOString()
    });

    document.getElementById('completeModal').classList.remove('active');
    generateReceipt(orderToComplete, amount, paymentMethod);
    showToast('Serviço finalizado com sucesso!', 'success');
  } catch (error) {
    showToast('Erro ao finalizar ordem: ' + error.message, 'error');
  }
}

function generateReceipt(orderId, amount, paymentMethod) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  const paymentNames = {
    pix: 'PIX', credito: 'Cartão de Crédito', debito: 'Cartão de Débito',
    especie: 'Em Espécie', crediario: 'Crediário'
  };

  const date = new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  });

  const receiptHTML = `
    <div style="text-align: center; font-family: monospace; max-width: 100%;">
      <h2 style="margin: 0; color: #ef4444;">RC CELULARES</h2>
      <p style="margin: 4px 0; font-size: 0.9rem;">Assistência Técnica</p>
      <hr style="margin: 12px 0; border: none; border-top: 1px dashed #ccc;">
      <h3>RECIBO DE SERVIÇO</h3>
      <div style="text-align: left; font-size: 0.95rem; line-height: 1.7;">
        <strong>Data:</strong> ${date}<br>
        <strong>Cliente:</strong> ${order.customerName}<br>
        <strong>Aparelho:</strong> ${order.device}<br>
        <strong>Defeito:</strong> ${order.defect}<br>
        <strong>Técnico:</strong> ${order.technician}<br><br>
        <strong>Valor Total:</strong> <span style="font-size: 1.4rem; color: #16a34a;">R$ ${amount.toFixed(2)}</span><br>
        <strong>Pagamento:</strong> ${paymentNames[paymentMethod] || paymentMethod}
      </div>
      <hr style="margin: 15px 0; border: none; border-top: 1px dashed #ccc;">
      <p>Obrigado pela preferência!</p>
    </div>
  `;

  document.getElementById('receiptContent').innerHTML = receiptHTML;
  document.getElementById('receiptModal').classList.add('active');
}

// ... (o resto das funções: createOrder, updateOrderStatus, renderAdminOrders, etc. permanecem iguais)

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Sistema RC Celulares carregado');

  // Preenche os seletores de páginas
  pages = {
    login: document.getElementById('page-login'),
    admin: document.getElementById('page-admin'),
    cliente: document.getElementById('page-cliente')
  };

  initApp();
});
