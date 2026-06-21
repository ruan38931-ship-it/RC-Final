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
    if (typeof firebase !== 'undefined') {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      useFirebase = true;
      console.log("Firebase conectado com sucesso!");
    } else {
      console.warn("Firebase nao carregado. Usando localStorage.");
      useFirebase = false;
    }
  } catch (e) {
    console.error("Erro ao conectar Firebase, usando local:", e);
    useFirebase = false;
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
    // Sincronização Firebase com tratamento de erros
    db.collection("orders").orderBy("createdAt", "desc").onSnapshot((snapshot) => {
      orders = snapshot.docs.map(doc => {
        const data = doc.data();
        return { ...data, id: doc.id }; // Garante que o ID do documento Firestore seja o ID principal
      });
      updateUI();
    }, (error) => {
      console.error("Erro na consulta de ordens:", error);
      if (error.code === 'failed-precondition') {
        showToast("Erro: O banco de dados precisa de um índice. Verifique o console.", "error");
      } else {
        showToast("Erro ao carregar ordens do banco de dados", "error");
      }
    });

    db.collection("employees").onSnapshot((snapshot) => {
      employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderEmployeeList();
    }, (error) => {
      console.error("Erro na consulta de funcionários:", error);
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
  const nameInput = document.getElementById('clientName').value.trim().toLowerCase();
  const phoneInput = document.getElementById('clientPhone').value.replace(/\D/g, '');

  if (!nameInput || !phoneInput) {
    showToast('Preencha todos os campos', 'error');
    return;
  }

  // Busca flexível: encontra qualquer ordem onde o nome ou telefone batam
  const foundOrder = orders.find(o => {
    const orderName = o.customerName.toLowerCase();
    const orderPhone = o.customerPhone.replace(/\D/g, '');
    return (orderName.includes(nameInput) || nameInput.includes(orderName)) && orderPhone.includes(phoneInput);
  });

  if (foundOrder) {
    loginSuccess({ name: foundOrder.customerName, phone: foundOrder.customerPhone }, 'cliente');
    renderCustomerOrders();
  } else {
    showToast('Dados não encontrados. Verifique o nome e telefone.', 'error');
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
    // id será gerado pelo Firebase ou Date.now() abaixo
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
  
  // Se estiver usando Firebase, garante que o createdAt seja um formato comparável
  if (useFirebase) {
    newOrder.createdAt = firebase.firestore.Timestamp.now().toDate().toISOString();
    await db.collection("orders").add(newOrder);
  } else {
    newOrder.id = Date.now().toString();
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
  console.log("Iniciando finalização da ordem:", orderToComplete);
  
  const amountInput = document.getElementById('completeAmount');
  const methodSelect = document.getElementById('completePaymentMethod');
  
  if (!amountInput || !methodSelect) {
    console.error("Elementos do modal não encontrados");
    return;
  }

  const amount = parseFloat(amountInput.value);
  const method = methodSelect.value;
  
  if (isNaN(amount) || amount < 0) {
    showToast('Informe um valor válido', 'error');
    return;
  }

  // Busca a ordem com cópia profunda para garantir que os dados não sumam
  const orderIndex = orders.findIndex(o => String(o.id) === String(orderToComplete));
  if (orderIndex === -1) {
    showToast('Erro: Ordem não localizada', 'error');
    return;
  }
  
  const orderCopy = JSON.parse(JSON.stringify(orders[orderIndex]));

  try {
    const completedAt = new Date().toISOString();
    
    if (useFirebase) {
      await db.collection("orders").doc(String(orderToComplete)).update({
        status: 'archive',
        amount: amount,
        paymentMethod: method,
        completedAt: completedAt
      });
    } else {
      orders[orderIndex].status = 'archive';
      orders[orderIndex].amount = amount;
      orders[orderIndex].paymentMethod = method;
      orders[orderIndex].completedAt = completedAt;
      saveData();
    }

    // Fecha o modal e limpa o campo
    const modal = document.getElementById('completeModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
    amountInput.value = '';
    
    showToast('Serviço finalizado!');
    
    // Chama o recibo imediatamente após o sucesso do salvamento
    generateWhatsAppReceipt(orderCopy, amount, method);

  } catch (error) {
    console.error("Erro ao finalizar ordem:", error);
    showToast('Erro ao salvar: ' + error.message, 'error');
  }
}

function generateWhatsAppReceipt(order, amount, method) {
  if (!order || !order.customerPhone) {
    console.error("Dados da ordem incompletos para recibo:", order);
    return;
  }

  const methodLabels = {
    'dinheiro': 'Dinheiro (Espécie)',
    'pix': 'Pix',
    'cartao_credito': 'Cartão de Crédito',
    'cartao_debito': 'Cartão de Débito',
    'crediario': 'Crediário'
  };

  const amountStr = typeof amount === 'number' ? amount.toFixed(2) : amount;
  const paymentMethod = methodLabels[method] || method;

  const message = encodeURIComponent(
    `*RECIBO DE PAGAMENTO - RC CELULARES*\n\n` +
    `Olá, *${order.customerName}*!\n` +
    `Seu serviço foi finalizado com sucesso.\n\n` +
    `*Dispositivo:* ${order.device}\n` +
    `*Defeito:* ${order.defect || 'N/A'}\n` +
    `*Valor:* R$ ${amountStr}\n` +
    `*Forma de Pagamento:* ${paymentMethod}\n` +
    `*Data:* ${new Date().toLocaleDateString('pt-BR')}\n\n` +
    `Agradecemos a preferência! 📱✨`
  );

  // Limpa o telefone: remove tudo que não é número e garante o formato correto
  let phone = order.customerPhone.replace(/\D/g, '');
  
  // Se o número não começar com 55, adiciona (ajuste conforme sua região se necessário)
  if (phone.length <= 11) {
    phone = '55' + phone;
  }

  const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${message}`;
  
  if (confirm('Deseja enviar o recibo via WhatsApp para o cliente?')) {
    window.open(whatsappUrl, '_blank');
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
  
  // Limpa os dados do usuário atual para comparação
  const currentName = currentUser.name.toLowerCase().trim();
  const currentPhone = currentUser.phone ? currentUser.phone.replace(/\D/g, '') : '';

  const clientOrders = orders.filter(o => {
    if (!o.customerName || !o.customerPhone) return false;
    
    const orderName = o.customerName.toLowerCase().trim();
    const orderPhone = o.customerPhone.replace(/\D/g, '');
    
    // Verifica se o nome contém o que foi digitado OU se o telefone é igual
    const nameMatch = orderName.includes(currentName) || currentName.includes(orderName);
    const phoneMatch = currentPhone !== '' && (orderPhone.includes(currentPhone) || currentPhone.includes(orderPhone));
    
    return nameMatch || phoneMatch;
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
