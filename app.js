/**
 * CONFIGURAÇÃO DO FIREBASE (OPCIONAL)
 * Para ativar o banco de dados na nuvem, preencha as chaves abaixo.
 * Se deixar como "SUA_API_KEY", o sistema usará o armazenamento local (localStorage).
 */
const firebaseConfig = {
apiKey: "AIzaSyBl-i7mqXXHs1OZwWxHORzTmRi0-KEquBA",
  authDomain: "rc-celulares-3e650.firebaseapp.com",
  projectId: "rc-celulares-3e650",
  storageBucket: "rc-celulares-3e650.firebasestorage.app",
  messagingSenderId: "688153532720",
  appId: "1:688153532720:web:41d1473a48788227c8d0f5"
};

// Estado da Conexão
let useFirebase = false;
let db = null;

if (firebaseConfig.apiKey !== "SUA_API_KEY") {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    useFirebase = true;
    console.log("Firebase conectado com sucesso!");
  } catch (e) {
    console.error("Erro ao conectar Firebase, usando local:", e);
  }
}

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
// INICIALIZAÇÃO
// ============================================
function initApp() {
  if (useFirebase) {
    // Sincronização Firebase
    db.collection("orders").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
      orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateUI();
    });
    db.collection("employees").onSnapshot((snapshot) => {
      employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderEmployeeList();
    });
  } else {
    // Sincronização Local
    const localOrders = localStorage.getItem('rc_orders');
    const localEmployees = localStorage.getItem('rc_employees');
    orders = localOrders ? JSON.parse(localOrders) : [];
    employees = localEmployees ? JSON.parse(localEmployees) : [];
    updateUI();
    renderEmployeeList();
  }

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

function saveData() {
  if (!useFirebase) {
    localStorage.setItem('rc_orders', JSON.stringify(orders));
    localStorage.setItem('rc_employees', JSON.stringify(employees));
    updateUI();
  }
}

// ============================================
// GERENCIAMENTO DE TELAS
// ============================================
function showPage(pageName) {
  Object.keys(pages).forEach(key => {
    pages[key].classList.remove('active');
    pages[key].style.display = 'none';
  });
  
  pages[pageName].classList.add('active');
  pages[pageName].style.display = 'block';

  const btnFaleConosco = document.getElementById('btnFaleConosco');
  if (pageName === 'cliente') {
    if(btnFaleConosco) btnFaleConosco.style.display = 'flex';
    document.getElementById('customerName').textContent = currentUser.name;
  } else {
    if(btnFaleConosco) btnFaleConosco.style.display = 'none';
    if (pageName === 'admin') {
      document.getElementById('adminEmployeeName').textContent = currentUser.name;
      updateAdminStats();
      generateQRCode();
    }
  }
}

// ============================================
// LÓGICA DE LOGIN
// ============================================
async function handleEmployeeLogin(e) {
  e.preventDefault();
  const code = document.getElementById('employeeCode').value;
  const password = document.getElementById('employeePassword').value;

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
  const name = document.getElementById('clientName').value;
  const phone = document.getElementById('clientPhone').value;

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
// OPERAÇÕES COM ORDENS
// ============================================
async function createOrder(e) {
  e.preventDefault();
  const newOrder = {
    id: useFirebase ? null : Date.now().toString(),
    device: document.getElementById('orderDevice').value,
    customerName: document.getElementById('orderCustomer').value,
    customerPhone: document.getElementById('orderPhone').value,
    technician: document.getElementById('orderTechnician').value,
    defect: document.getElementById('orderDefect').value,
    status: document.getElementById('orderStatus').value,
    createdAt: new Date().toISOString(),
    completedAt: null,
    amount: 0,
    paymentMethod: 'dinheiro'
  };

  if (useFirebase) {
    await db.collection("orders").add(newOrder);
  } else {
    orders.unshift(newOrder);
    saveData();
  }
  
  e.target.reset();
  showToast('Ordem de serviço criada!');
}

async function updateOrderStatus(orderId, newStatus) {
  if (newStatus === 'finalizado') {
    openCompleteModal(orderId);
    return;
  }

  if (useFirebase) {
    await db.collection("orders").doc(orderId).update({ status: newStatus });
  } else {
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
      orders[idx].status = newStatus;
      saveData();
    }
  }
  showToast('Status atualizado!');
}

let orderToComplete = null;
function openCompleteModal(orderId) {
  console.log("Abrindo modal para ordem:", orderId);
  orderToComplete = orderId;
  // Busca flexível (string ou number) para garantir que encontre a ordem
  const order = orders.find(o => String(o.id) === String(orderId));
  
  if (order) {
    const deviceEl = document.getElementById('completeOrderDevice');
    const customerEl = document.getElementById('completeOrderCustomer');
    const modalEl = document.getElementById('completeModal');
    
    if (deviceEl) deviceEl.textContent = order.device;
    if (customerEl) customerEl.textContent = order.customerName;
    if (modalEl) {
      modalEl.classList.add('active');
      modalEl.style.display = 'flex'; // Força a exibição via style também
    }
  } else {
    console.error("Ordem não encontrada:", orderId);
    showToast("Erro ao localizar ordem", "error");
  }
}

async function confirmCompleteOrder() {
  const amount = parseFloat(document.getElementById('completeAmount').value);
  const method = document.getElementById('completePaymentMethod').value;
  
  if (isNaN(amount) || amount < 0) {
    showToast('Informe um valor válido', 'error');
    return;
  }

  // Busca flexível do ID para garantir que encontre a ordem para o recibo
  const order = orders.find(o => String(o.id) === String(orderToComplete));

  if (useFirebase) {
    await db.collection("orders").doc(String(orderToComplete)).update({
      status: 'archive',
      amount: amount,
      paymentMethod: method,
      completedAt: new Date().toISOString()
    });
  } else {
    const idx = orders.findIndex(o => String(o.id) === String(orderToComplete));
    if (idx !== -1) {
      orders[idx].status = 'archive';
      orders[idx].amount = amount;
      orders[idx].paymentMethod = method;
      orders[idx].completedAt = new Date().toISOString();
      saveData();
    }
  }

  const modal = document.getElementById('completeModal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  document.getElementById('completeAmount').value = '';
  showToast('Serviço finalizado!');
  generateWhatsAppReceipt(order, amount, method);
}

function generateWhatsAppReceipt(order, amount, method) {
  const methodLabels = {
    'dinheiro': 'Dinheiro (Espécie)',
    'pix': 'Pix',
    'cartao_credito': 'Cartão de Crédito',
    'cartao_debito': 'Cartão de Débito',
    'crediario': 'Crediário'
  };

  const message = encodeURIComponent(
    `*RECIBO DE PAGAMENTO - RC CELULARES*\n\n` +
    `Olá, *${order.customerName}*!\n` +
    `Seu serviço foi finalizado com sucesso.\n\n` +
    `*Dispositivo:* ${order.device}\n` +
    `*Defeito:* ${order.defect}\n` +
    `*Valor:* R$ ${amount.toFixed(2)}\n` +
    `*Forma de Pagamento:* ${methodLabels[method]}\n` +
    `*Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n` +
    `Agradecemos a preferência! 📱✨`
  );

  const phone = order.customerPhone.replace(/\D/g, '');
  if (confirm('Deseja enviar o recibo via WhatsApp para o cliente?')) {
    window.open(`https://wa.me/55${phone}?text=${message}`, '_blank');
  }
}

// ============================================
// FUNCIONÁRIOS
// ============================================
async function addEmployee(e) {
  e.preventDefault();
  const name = document.getElementById('empName').value;
  const code = document.getElementById('empCode').value;
  const password = document.getElementById('empPassword').value;

  const newEmp = { id: Date.now().toString(), name, code, password };

  if (useFirebase) {
    delete newEmp.id;
    await db.collection("employees").add(newEmp);
  } else {
    employees.push(newEmp);
    saveData();
    renderEmployeeList();
  }
  e.target.reset();
  showToast('Funcionário adicionado!');
}

async function deleteEmployee(empId) {
  if (!confirm('Remover funcionário?')) return;
  if (useFirebase) {
    await db.collection("employees").doc(empId).delete();
  } else {
    employees = employees.filter(e => e.id !== empId);
    saveData();
    renderEmployeeList();
  }
}

// ============================================
// UI RENDER
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
    if(!container) return;
    
    let filtered = (tab === 'active') ? orders.filter(o => o.status !== 'archive') : orders.filter(o => o.status === tab);
    const countEl = document.getElementById(`count-${tab}`);
    if(countEl) countEl.textContent = filtered.length;

    container.innerHTML = filtered.length ? filtered.map(o => renderOrderCard(o, true)).join('') : '<div class="empty-state"><p>Nenhuma ordem aqui</p></div>';
  });
}

function renderCustomerOrders() {
  console.log("Renderizando ordens para o cliente:", currentUser);
  const clientOrders = orders.filter(o => {
    if (!o.customerName || !o.customerPhone) return false;
    
    const orderName = o.customerName.toLowerCase().trim();
    const currentName = currentUser.name.toLowerCase().trim();
    
    const orderPhone = o.customerPhone.replace(/\D/g, '');
    const currentPhone = currentUser.phone ? currentUser.phone.replace(/\D/g, '') : '';
    
    // Busca por nome exato OU telefone exato para ser mais flexível
    return orderName === currentName || (currentPhone !== '' && orderPhone === currentPhone);
  });

  const active = clientOrders.filter(o => o.status !== 'archive');
  const completed = clientOrders.filter(o => o.status === 'archive');

  const tabsContainer = document.getElementById('customerTabs');
  const noOrdersContainer = document.getElementById('customerNoOrders');

  if (clientOrders.length > 0) {
    if(tabsContainer) tabsContainer.classList.remove('hidden');
    if(noOrdersContainer) noOrdersContainer.classList.add('hidden');
  } else {
    if(tabsContainer) tabsContainer.classList.add('hidden');
    if(noOrdersContainer) noOrdersContainer.classList.remove('hidden');
  }

  const activeCountEl = document.getElementById('customerActiveCount');
  const completedCountEl = document.getElementById('customerCompletedCount');
  if(activeCountEl) activeCountEl.textContent = active.length;
  if(completedCountEl) completedCountEl.textContent = completed.length;
  
  const activeTab = document.getElementById('customer-tab-active');
  const completedTab = document.getElementById('customer-tab-completed');
  
  if(activeTab) activeTab.innerHTML = active.length ? active.map(o => renderOrderCard(o, false)).join('') : '<p class="text-center py-4">Nenhuma ordem ativa</p>';
  if(completedTab) completedTab.innerHTML = completed.length ? completed.map(o => renderOrderCard(o, false)).join('') : '<p class="text-center py-4">Nenhuma ordem concluída</p>';
}

function renderOrderCard(order, isAdmin) {
  const statusLabels = { 'em-analise': 'Análise', 'em-manutencao': 'Manutenção', 'esperando-peca': 'Peças', 'pronto': 'Pronto', 'archive': 'Concluído' };
  const paymentLabels = { 'dinheiro': 'Dinheiro', 'pix': 'Pix', 'cartao_credito': 'Crédito', 'cartao_debito': 'Débito', 'crediario': 'Crediário' };
  const createdDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString('pt-BR') : '--/--/----';
  
  let html = `
    <div class="order-card">
      <div class="flex justify-between mb-2">
        <h3 class="font-bold">${order.device}</h3>
        <span class="status-badge status-${order.status}">${statusLabels[order.status] || order.status}</span>
      </div>
      <p class="text-sm mb-1"><strong>Cliente:</strong> ${order.customerName}</p>
      <p class="text-sm mb-1"><strong>Telefone:</strong> ${order.customerPhone}</p>
      <p class="text-sm mb-1"><strong>Técnico:</strong> ${order.technician}</p>
      <p class="text-sm mb-1"><strong>Data:</strong> ${createdDate}</p>
      <p class="text-xs text-gray-500 mb-4"><strong>Defeito:</strong> ${order.defect}</p>`;

  if (isAdmin && order.status !== 'archive') {
    html += `
      <div class="flex gap-2">
        <select class="flex-1 text-xs p-1 border rounded" onchange="updateOrderStatus('${order.id}', this.value)">
          <option value="em-analise" ${order.status === 'em-analise' ? 'selected' : ''}>Análise</option>
          <option value="em-manutencao" ${order.status === 'em-manutencao' ? 'selected' : ''}>Manutenção</option>
          <option value="esperando-peca" ${order.status === 'esperando-peca' ? 'selected' : ''}>Peças</option>
          <option value="pronto" ${order.status === 'pronto' ? 'selected' : ''}>Pronto</option>
          <option value="finalizado">Finalizar</option>
        </select>
        <button class="btn btn-primary btn-sm" style="background-color: #ef4444 !important;" onclick="openCompleteModal('${order.id}')">Finalizar</button>
      </div>`;
  }

  if (order.status === 'archive') {
    const paymentMethod = paymentLabels[order.paymentMethod] || order.paymentMethod || 'Dinheiro';
    const amount = order.amount ? order.amount.toFixed(2) : '0.00';
    html += `<div class="mt-3 pt-3 border-t text-sm font-bold text-green-600">✓ Serviço Concluído - Pago: R$ ${amount} (${paymentMethod})</div>`;
  }

  html += `</div>`;
  return html;
}

function renderEmployeeList() {
  const container = document.getElementById('employeeList');
  if(!container) return;
  document.getElementById('employeeCount').textContent = employees.length + 1;
  let html = `<div class="p-2 bg-gray-100 rounded mb-2 font-bold text-sm">Administrador (Sistema)</div>`;
  html += employees.map(e => `<div class="flex justify-between p-2 border rounded mb-2 text-sm"><span>${e.name}</span><button onclick="deleteEmployee('${e.id}')" class="text-red-500">X</button></div>`).join('');
  container.innerHTML = html;
}

function renderCustomerHistory() {
  const container = document.getElementById('customerHistoryList');
  if(!container) return;
  const customers = {};
  orders.forEach(o => {
    const key = o.customerPhone;
    if(!customers[key]) customers[key] = { name: o.customerName, count: 0 };
    customers[key].count++;
  });
  container.innerHTML = Object.values(customers).map(c => `<div class="p-2 border rounded mb-2 text-sm"><b>${c.name}</b> - ${c.count} ordens</div>`).join('');
}

function updateAdminStats() {
  const completed = orders.filter(o => o.status === 'archive');
  const revenue = completed.reduce((acc, o) => acc + o.amount, 0);
  const payments = { dinheiro: 0, pix: 0, cartao_credito: 0, cartao_debito: 0, crediario: 0 };
  completed.forEach(o => payments[o.paymentMethod || 'dinheiro'] += o.amount);

  const archiveContainer = document.getElementById('admin-tab-archive');
  if (archiveContainer) {
    const paymentLabels = { 'dinheiro': 'Dinheiro', 'pix': 'Pix', 'cartao_credito': 'Crédito', 'cartao_debito': 'Débito', 'crediario': 'Crediário' };
    archiveContainer.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card"><h3>Total</h3><p>R$ ${revenue.toFixed(2)}</p></div>
        <div class="stat-card"><h3>Serviços</h3><p>${completed.length}</p></div>
      </div>
      <div class="card p-4 mb-4">
        <h4 class="font-bold mb-2">💵 Livro Caixa</h4>
        <div class="grid grid-2 gap-2 text-sm">
          <div>Dinheiro: R$ ${payments.dinheiro.toFixed(2)}</div>
          <div>Pix: R$ ${payments.pix.toFixed(2)}</div>
          <div>Crédito: R$ ${payments.cartao_credito.toFixed(2)}</div>
          <div>Débito: R$ ${payments.cartao_debito.toFixed(2)}</div>
          <div>Crediário: R$ ${payments.crediario.toFixed(2)}</div>
        </div>
      </div>
      <div class="space-y-2">${completed.map(o => renderOrderCard(o, true)).join('')}</div>
    `;
  }
}

function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  document.getElementById('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function generateQRCode() {
  const canvas = document.getElementById('qrCanvas');
  if(canvas) {
    canvas.innerHTML = '';
    new QRCode(canvas, { text: window.location.href, width: 128, height: 128 });
  }
}

function setupEventListeners() {
  document.querySelectorAll('.tab-trigger').forEach(t => {
    t.addEventListener('click', () => {
      const parent = t.closest('.tabs-list').nextElementSibling;
      t.parentElement.querySelectorAll('.tab-trigger').forEach(i => i.classList.remove('active'));
      t.classList.add('active');
      const tabId = t.dataset.tab;
      
      // Lógica específica para abas de admin e cliente
      const containerId = t.closest('#adminTabs') ? `admin-tab-${tabId}` : 
                         t.closest('#customerTabs') ? `customer-tab-${tabId}` : `tab-${tabId}`;
      
      const allTabs = t.closest('.tabs-list').parentElement.querySelectorAll('.tab-content');
      allTabs.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      
      const activeTab = document.getElementById(containerId);
      if(activeTab) {
        activeTab.classList.add('active');
        activeTab.style.display = 'block';
      }
    });
  });

  document.getElementById('formEmployee').onsubmit = handleEmployeeLogin;
  document.getElementById('formClient').onsubmit = handleClientLogin;
  document.getElementById('formNewOrder').onsubmit = createOrder;
  document.getElementById('formEmployee_admin').onsubmit = addEmployee;
  document.getElementById('btnAdminLogout').onclick = logout;
  document.getElementById('btnCustomerLogout').onclick = logout;
  document.getElementById('btnCancelComplete').onclick = () => {
    const modal = document.getElementById('completeModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  };
  document.getElementById('btnConfirmComplete').onclick = confirmCompleteOrder;
}

initApp();
