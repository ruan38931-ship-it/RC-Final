/**
 * CONFIGURAÇÃO DO FIREBASE
 * Substitua os valores abaixo pelas suas credenciais do Firebase Console
 */
const firebaseConfig = {
  apiKey: "AIzaSyBl-i7mqXXHs1OZwWxHORzTmRi0-KEquBA",
  authDomain: "rc-celulares-3e650.firebaseapp.com",
  projectId: "rc-celulares-3e650",
  storageBucket: "rc-celulares-3e650.firebasestorage.app",
  messagingSenderId: "688153532720",
  appId: "1:688153532720:web:41d1473a48788227c8d0f5"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================
// ESTADO GLOBAL E SELETORES
// ============================================
let currentUser = null;
let currentRole = null;
let orders = [];
let employees = [];

const pages = {
  login: document.getElementById('page-login'),
  admin: document.getElementById('page-admin'),
  cliente: document.getElementById('page-cliente')
};

// ============================================
// INICIALIZAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
// ============================================
function initApp() {
  // 1. Escutar Ordens em Tempo Real
  db.collection("orders").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
    orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    updateUI();
  });

  // 2. Escutar Funcionários em Tempo Real
  db.collection("employees").onSnapshot((snapshot) => {
    employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderEmployeeList();
  });

  // Verificar sessão no localStorage (apenas para persistir login local)
  const savedUser = localStorage.getItem('rc_user');
  const savedRole = localStorage.getItem('rc_role');

  if (savedUser && savedRole) {
    currentUser = JSON.parse(savedUser);
    currentRole = savedRole;
    showPage(currentRole === 'admin' ? 'admin' : 'cliente');
  } else {
    showPage('login');
  }

  setupEventListeners();
}

// ============================================
// GERENCIAMENTO DE TELAS
// ============================================
function showPage(pageName) {
  Object.keys(pages).forEach(key => {
    pages[key].classList.remove('active');
  });
  pages[pageName].classList.add('active');

  if (pageName === 'admin') {
    document.getElementById('adminEmployeeName').textContent = currentUser.name;
    updateAdminStats();
    generateQRCode();
  } else if (pageName === 'cliente') {
    document.getElementById('customerName').textContent = currentUser.name;
  }
}

// ============================================
// LÓGICA DE LOGIN
// ============================================
async function handleEmployeeLogin(e) {
  e.preventDefault();
  const code = document.getElementById('employeeCode').value;
  const password = document.getElementById('employeePassword').value;

  // Admin padrão do sistema
  if (code === 'admin' && password === 'Edj54kgc001') {
    loginSuccess({ name: 'Administrador', code: 'admin' }, 'admin');
    return;
  }

  // Verificar no Firebase
  const emp = employees.find(e => e.code === code && e.password === password);
  if (emp) {
    loginSuccess(emp, 'admin');
  } else {
    showToast('Código ou senha incorretos', 'error');
  }
}

function handleClientLogin(e) {
  e.preventDefault();
  const name = document.getElementById('clientName').value;
  const phone = document.getElementById('clientPhone').value;

  // Verifica se existe alguma ordem para este cliente
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
  showToast(`Bem-vindo, ${user.name}!`);
}

function logout() {
  currentUser = null;
  currentRole = null;
  localStorage.removeItem('rc_user');
  localStorage.removeItem('rc_role');
  showPage('login');
}

// ============================================
// OPERAÇÕES COM ORDENS DE SERVIÇO (FIREBASE)
// ============================================
async function createOrder(e) {
  e.preventDefault();
  const newOrder = {
    device: document.getElementById('orderDevice').value,
    customerName: document.getElementById('orderCustomer').value,
    customerPhone: document.getElementById('orderPhone').value,
    technician: document.getElementById('orderTechnician').value,
    defect: document.getElementById('orderDefect').value,
    status: document.getElementById('orderStatus').value,
    createdAt: new Date().toISOString(),
    completedAt: null,
    amount: 0
  };

  try {
    await db.collection("orders").add(newOrder);
    e.target.reset();
    showToast('Ordem de serviço criada com sucesso!');
  } catch (error) {
    showToast('Erro ao criar ordem: ' + error.message, 'error');
  }
}

async function updateOrderStatus(orderId, newStatus) {
  if (newStatus === 'finalizado') {
    openCompleteModal(orderId);
    return;
  }

  try {
    await db.collection("orders").doc(orderId).update({ status: newStatus });
    showToast('Status atualizado!');
  } catch (error) {
    showToast('Erro ao atualizar status', 'error');
  }
}

let orderToComplete = null;
function openCompleteModal(orderId) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return;

  orderToComplete = orderId;
  document.getElementById('completeOrderDevice').textContent = order.device;
  document.getElementById('completeOrderCustomer').textContent = order.customerName;
  document.getElementById('completeModal').classList.add('active');
}

async function confirmCompleteOrder() {
  const amount = parseFloat(document.getElementById('completeAmount').value);
  if (isNaN(amount) || amount < 0) {
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
    document.getElementById('completeAmount').value = '';
    showToast('Serviço finalizado e arquivado!');
  } catch (error) {
    showToast('Erro ao finalizar serviço', 'error');
  }
}

// ============================================
// GERENCIAMENTO DE FUNCIONÁRIOS (FIREBASE)
// ============================================
async function addEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('empName').value;
  const code = document.getElementById('empCode').value;
  const password = document.getElementById('empPassword').value;

  if (!name || !code || !password) {
    showToast('Preencha todos os campos', 'error');
    return;
  }

  try {
    await db.collection("employees").add({ name, code, password });
    e.target.reset();
    showToast('Funcionário adicionado!');
  } catch (error) {
    showToast('Erro ao adicionar funcionário', 'error');
  }
}

async function deleteEmployee(empId) {
  if (!confirm('Deseja realmente remover este funcionário?')) return;
  
  try {
    await db.collection("employees").doc(empId).delete();
    showToast('Funcionário removido');
  } catch (error) {
    showToast('Erro ao remover funcionário', 'error');
  }
}

// ============================================
// RENDERIZAÇÃO DA UI
// ============================================
function updateUI() {
  if (currentRole === 'admin') {
    renderAdminOrders();
    updateAdminStats();
    renderCustomerHistory();
  } else if (currentRole === 'cliente') {
    renderCustomerOrders();
  }
}

function renderAdminOrders() {
  const tabs = ['active', 'em-analise', 'em-manutencao', 'esperando-peca', 'completed', 'archive'];
  
  tabs.forEach(tab => {
    const container = document.getElementById(`admin-tab-${tab}`);
    let filtered = [];

    if (tab === 'active') {
      filtered = orders.filter(o => o.status !== 'archive');
    } else {
      filtered = orders.filter(o => o.status === tab);
    }

    document.getElementById(`count-${tab}`).textContent = filtered.length;

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>Nenhuma ordem nesta categoria</p></div>`;
      return;
    }

    container.innerHTML = filtered.map(o => renderOrderCard(o, true)).join('');
  });
}

function renderCustomerOrders() {
  const activeContainer = document.getElementById('customer-tab-active');
  const completedContainer = document.getElementById('customer-tab-completed');

  const clientOrders = orders.filter(o => 
    o.customerName.toLowerCase() === currentUser.name.toLowerCase() &&
    o.customerPhone.replace(/\D/g, '') === currentUser.phone.replace(/\D/g, '')
  );

  const active = clientOrders.filter(o => o.status !== 'archive');
  const completed = clientOrders.filter(o => o.status === 'archive');

  document.getElementById('customerActiveCount').textContent = active.length;
  document.getElementById('customerCompletedCount').textContent = completed.length;

  document.getElementById('customerTabs').classList.remove('hidden');
  document.getElementById('customerNoOrders').classList.add('hidden');

  activeContainer.innerHTML = active.length ? active.map(o => renderOrderCard(o, false)).join('') : '<div class="empty-state"><p>Nenhuma ordem em andamento</p></div>';
  completedContainer.innerHTML = completed.length ? completed.map(o => renderOrderCard(o, false)).join('') : '<div class="empty-state"><p>Nenhuma ordem finalizada</p></div>';
}

function renderOrderCard(order, isAdmin) {
  const date = new Date(order.createdAt).toLocaleDateString('pt-BR');
  const statusLabels = {
    'em-analise': 'Em Análise',
    'em-manutencao': 'Em Manutenção',
    'esperando-peca': 'Esperando Peça',
    'pronto': 'Pronto',
    'archive': 'Concluído'
  };

  return `
    <div class="order-card">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-lg">${order.device}</h3>
          <p class="text-sm" style="color: var(--muted-foreground)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            ${order.customerName} • ${order.customerPhone}
          </p>
        </div>
        <span class="status-badge status-${order.status}">${statusLabels[order.status]}</span>
      </div>
      
      <div class="mb-4">
        <div class="text-xs font-semibold uppercase mb-1" style="color: var(--muted-foreground)">Defeito:</div>
        <p class="text-sm">${order.defect}</p>
      </div>

      <div class="flex flex-wrap gap-4 items-center justify-between pt-4" style="border-top: 1px solid var(--border)">
        <div class="flex items-center gap-2 text-sm font-medium" style="color: #2563eb">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
          Técnico: ${order.technician}
        </div>
        <div class="text-xs" style="color: var(--muted-foreground)">
          Criado em: ${date}
          ${order.completedAt ? `<br>Concluído: ${new Date(order.completedAt).toLocaleDateString('pt-BR')}` : ''}
        </div>
      </div>

      ${isAdmin && order.status !== 'archive' ? `
        <div class="flex gap-2 mt-4">
          <select class="flex-1 text-sm p-2 border rounded" onchange="updateOrderStatus('${order.id}', this.value)">
            <option value="em-analise" ${order.status === 'em-analise' ? 'selected' : ''}>Em Análise</option>
            <option value="em-manutencao" ${order.status === 'em-manutencao' ? 'selected' : ''}>Em Manutenção</option>
            <option value="esperando-peca" ${order.status === 'esperando-peca' ? 'selected' : ''}>Esperando Peça</option>
            <option value="pronto" ${order.status === 'pronto' ? 'selected' : ''}>Pronto</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${order.id}', 'finalizado')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px"><polyline points="20 6 9 17 4 12"/></svg>
            Finalizar
          </button>
        </div>
      ` : ''}

      ${order.status === 'archive' ? `
        <div class="mt-4 pt-4 flex justify-between items-center" style="border-top: 1px dashed var(--border)">
          <span class="text-sm font-bold text-green-600">Valor: R$ ${order.amount.toFixed(2)}</span>
          <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold">PAGO</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderEmployeeList() {
  const container = document.getElementById('employeeList');
  document.getElementById('employeeCount').textContent = employees.length + 1; // +1 do admin padrão

  let html = `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <div class="font-bold text-sm">Administrador</div>
        <div class="text-xs text-gray-400">Funcionário Principal</div>
      </div>
      <span class="text-xs font-bold text-blue-600 uppercase">Sistema</span>
    </div>
  `;

  html += employees.map(emp => `
    <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div>
        <div class="font-bold text-sm">${emp.name}</div>
        <div class="text-xs text-gray-400">Funcionário Ativo</div>
      </div>
      <button class="text-red-500 hover:text-red-700 p-1" onclick="deleteEmployee('${emp.id}')" title="Remover Funcionário">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  `).join('');

  container.innerHTML = html || '<p class="text-xs text-center text-gray-400 py-4">Nenhum funcionário adicional cadastrado</p>';
}

function renderCustomerHistory() {
  const container = document.getElementById('customerHistoryList');
  const customersMap = new Map();

  orders.forEach(o => {
    const key = `${o.customerName}|${o.customerPhone}`;
    if (!customersMap.has(key)) {
      customersMap.set(key, { 
        name: o.customerName, 
        phone: o.customerPhone, 
        count: 0, 
        lastVisit: o.createdAt 
      });
    }
    const data = customersMap.get(key);
    data.count++;
    if (new Date(o.createdAt) > new Date(data.lastVisit)) {
      data.lastVisit = o.createdAt;
    }
  });

  const customers = Array.from(customersMap.values());
  document.getElementById('customerHistoryCount').textContent = `${customers.length} cliente(s) registrado(s)`;

  container.innerHTML = customers.map(c => `
    <div class="p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
      <div class="font-bold text-sm">${c.name}</div>
      <div class="text-xs text-gray-500">${c.phone}</div>
      <div class="flex justify-between mt-2 pt-2 border-top" style="border-top: 1px solid #f3f4f6">
        <span class="text-xs">Última visita: ${new Date(c.lastVisit).toLocaleDateString('pt-BR')}</span>
        <span class="text-xs font-bold text-red-600">${c.count} ordem(ns)</span>
      </div>
    </div>
  `).join('') || '<p class="text-xs text-center text-gray-400 py-4">Nenhum cliente registrado ainda</p>';
}

function updateAdminStats() {
  const completedOrders = orders.filter(o => o.status === 'archive');
  const totalRevenue = completedOrders.reduce((acc, o) => acc + o.amount, 0);
  const ticketMedio = completedOrders.length ? totalRevenue / completedOrders.length : 0;
  
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  const revenueThisMonth = completedOrders
    .filter(o => {
      const d = new Date(o.completedAt);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((acc, o) => acc + o.amount, 0);

  // Renderizar estatísticas na aba Arquivo
  const archiveContainer = document.getElementById('admin-tab-archive');
  if (archiveContainer) {
    const devicesMap = {};
    completedOrders.forEach(o => {
      devicesMap[o.device] = (devicesMap[o.device] || 0) + 1;
    });
    const topDevices = Object.entries(devicesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    archiveContainer.innerHTML = `
      <div class="stats-grid mb-6">
        <div class="stat-card">
          <div class="text-xs text-muted-foreground mb-1">Total de Serviços</div>
          <div class="text-2xl font-bold text-green-600">${completedOrders.length}</div>
          <div class="text-xs text-muted-foreground mt-1">Serviços concluídos</div>
        </div>
        <div class="stat-card">
          <div class="text-xs text-muted-foreground mb-1">Receita Total</div>
          <div class="text-2xl font-bold text-blue-600">R$ ${totalRevenue.toFixed(2)}</div>
          <div class="text-xs text-muted-foreground mt-1">Faturamento total</div>
        </div>
        <div class="stat-card">
          <div class="text-xs text-muted-foreground mb-1">Ticket Médio</div>
          <div class="text-2xl font-bold text-purple-600">R$ ${ticketMedio.toFixed(2)}</div>
          <div class="text-xs text-muted-foreground mt-1">Valor médio por serviço</div>
        </div>
        <div class="stat-card">
          <div class="text-xs text-muted-foreground mb-1">Este Mês</div>
          <div class="text-2xl font-bold text-orange-600">R$ ${revenueThisMonth.toFixed(2)}</div>
          <div class="text-xs text-muted-foreground mt-1">Faturamento mensal</div>
        </div>
      </div>

      <div class="card mb-6">
        <div class="card-header"><div class="card-title">Dispositivos Mais Atendidos</div></div>
        <div class="card-content">
          ${topDevices.map(([name, count], i) => `
            <div class="flex items-center justify-between p-2 mb-2 bg-gray-50 rounded">
              <div class="flex items-center gap-3">
                <span class="w-6 h-6 flex items-center justify-center bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">${i+1}</span>
                <span class="text-sm font-medium">${name}</span>
              </div>
              <span class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full font-bold">${count} serviço(s)</span>
            </div>
          `).join('') || '<p class="text-sm text-center text-gray-400">Sem dados suficientes</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Histórico Completo (${completedOrders.length})</div></div>
        <div class="card-content space-y-4">
          ${completedOrders.map(o => renderOrderCard(o, true)).join('')}
        </div>
      </div>
    `;
  }
}

// ============================================
// UTILITÁRIOS
// ============================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.getElementById('toastContainer').appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function generateQRCode() {
  const canvas = document.getElementById('qrCanvas');
  const link = window.location.href;
  document.getElementById('qrLink').textContent = link;
  canvas.innerHTML = '';
  new QRCode(canvas, {
    text: link,
    width: 160,
    height: 160,
    colorDark: "#ef4444",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const parent = trigger.closest('#loginTabs, #adminTabs, #customerTabs');
      parent.querySelectorAll('.tab-trigger').forEach(t => t.classList.remove('active'));
      parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      trigger.classList.add('active');
      const tabId = trigger.dataset.tab;
      
      if (parent.id === 'loginTabs') {
        document.getElementById(`tab-${tabId}`).classList.add('active');
      } else if (parent.id === 'adminTabs') {
        document.getElementById(`admin-tab-${tabId}`).classList.add('active');
      } else {
        document.getElementById(`customer-tab-${tabId}`).classList.add('active');
      }
    });
  });

  // Forms
  document.getElementById('formEmployee').addEventListener('submit', handleEmployeeLogin);
  document.getElementById('formClient').addEventListener('submit', handleClientLogin);
  document.getElementById('formNewOrder').addEventListener('submit', createOrder);
  document.getElementById('formEmployee_admin').addEventListener('submit', addEmployee);
  
  // Buttons
  document.getElementById('btnAdminLogout').addEventListener('click', logout);
  document.getElementById('btnCustomerLogout').addEventListener('click', logout);
  document.getElementById('btnCancelComplete').addEventListener('click', () => {
    document.getElementById('completeModal').classList.remove('active');
  });
  document.getElementById('btnConfirmComplete').addEventListener('click', confirmCompleteOrder);
  document.getElementById('btnCopyLink').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href);
    showToast('Link copiado!');
  });
// ============================================
// RC Celulares - App.js
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Sistema RC Celulares carregado');

  // ==================== MODAL DE FINALIZAÇÃO ====================
  const completeModal = document.getElementById('completeModal');
  const btnCancelComplete = document.getElementById('btnCancelComplete');
  const btnConfirmComplete = document.getElementById('btnConfirmComplete');
  const completeAmount = document.getElementById('completeAmount');
  const completeOrderDevice = document.getElementById('completeOrderDevice');
  const completeOrderCustomer = document.getElementById('completeOrderCustomer');

  let orderToComplete = null;

  // Abrir modal de finalização
  window.openCompleteModal = function(order) {
    orderToComplete = order;
    
    completeOrderDevice.textContent = order.device || 'Dispositivo não informado';
    completeOrderCustomer.textContent = order.customer || 'Cliente não informado';
    
    completeAmount.value = order.value || '';
    completeModal.style.display = 'flex';
    completeAmount.focus();
    completeAmount.select();
  };

  // Fechar modal
  function closeCompleteModal() {
    completeModal.style.display = 'none';
    orderToComplete = null;
  }

  btnCancelComplete.addEventListener('click', closeCompleteModal);

  // Confirmar finalização
  btnConfirmComplete.addEventListener('click', () => {
    const amount = parseFloat(completeAmount.value);
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;

    if (!amount || amount <= 0) {
      alert('⚠️ Por favor, informe um valor válido.');
      completeAmount.focus();
      return;
    }

    if (!paymentMethod) {
      alert('⚠️ Selecione uma forma de pagamento.');
      return;
    }

    const paymentNames = {
      pix: 'PIX',
      credito: 'Cartão de Crédito',
      debito: 'Cartão de Débito',
      especie: 'Em Espécie',
      crediario: 'Crediário'
    };

    if (orderToComplete) {
      console.log(`Ordem finalizada: ${orderToComplete.id} | Valor: R$ ${amount.toFixed(2)} | Pagamento: ${paymentNames[paymentMethod]}`);
      
      // Aqui futuramente você vai salvar no Firebase
      // saveCompletedOrder(orderToComplete.id, amount, paymentMethod);

      alert(`✅ Ordem finalizada com sucesso!\n\n` +
            `Valor: R$ ${amount.toFixed(2)}\n` +
            `Forma de Pagamento: ${paymentNames[paymentMethod]}`);

      closeCompleteModal();
      // loadOrders(); // Recarregar lista
    }
  });

  // Fechar clicando fora
  completeModal.addEventListener('click', (e) => {
    if (e.target === completeModal) closeCompleteModal();
  });

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && completeModal.style.display === 'flex') {
      closeCompleteModal();
    }
  });

});
   
}

// Iniciar
initApp();
