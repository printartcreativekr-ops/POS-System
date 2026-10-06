/* =========================
   PRINTART POS - app.js
   =========================
   1) Replace SUPABASE_URL and SUPABASE_ANON_KEY.
   2) Create users in Supabase Auth.
   3) Run the supplied SQL schema/policies.
*/
const SUPABASE_URL = "https://pzjsoduvrczugavmyitd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6anNvZHV2cmN6dWdhdm15aXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNTE1OTUsImV4cCI6MjEwNjgyNzU5NX0.pJUrKQuTMvZIJp3HiISyVM9KQwbrRfnKI43xt3F0tCc";

let supabaseClient = null;
let products = [];
let cart = [];
let selectedPayment = "Cash";
let transactions = [];
let editingProductId = null;

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(n)||0);
const todayISO = () => new Date().toISOString().slice(0,10);

document.addEventListener("DOMContentLoaded", init);

async function init(){
  bindNavigation();
  bindEvents();
  $("reportDate").value = todayISO();
  $("transactionDate").value = todayISO();

  if(SUPABASE_URL.startsWith("YOUR_") || SUPABASE_ANON_KEY.startsWith("YOUR_")){
    setCloud(false, "Set Supabase credentials in app.js");
    $("loginOverlay").classList.add("hidden");
    showMessage("posMessage","Supabase credentials are not configured yet.","error");
    return;
  }

  try{
    supabaseClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    const {data:{session}} = await supabaseClient.auth.getSession();
    if(session) await startApp(session);
    else $("loginOverlay").classList.remove("hidden");

    supabaseClient.auth.onAuthStateChange(async (_event, session)=>{
      if(session) await startApp(session);
      else $("loginOverlay").classList.remove("hidden");
    });
  }catch(err){
    setCloud(false, "Connection error");
    showMessage("loginMessage",err.message,"error");
  }
}

function bindNavigation(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click",()=>showPage(btn.dataset.page));
  });
  document.querySelectorAll("[data-page-jump]").forEach(btn=>{
    btn.addEventListener("click",()=>showPage(btn.dataset.pageJump));
  });
}
function showPage(pageId){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  $(pageId).classList.add("active");
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.page===pageId));
  if(pageId==="dashboardPage") loadDashboard();
  if(pageId==="transactionsPage") loadTransactions();
  if(pageId==="productsPage") renderProductTable();
  if(pageId==="reportsPage") loadReport();
}

function bindEvents(){
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = logout;
  $("productSearch").oninput = renderProductGrid;
  $("categoryFilter").onchange = renderProductGrid;
  $("clearCartBtn").onclick = clearCart;
  $("amountReceived").oninput = updateChange;
  $("completeSaleBtn").onclick = completeSale;
  $("refreshDashboardBtn").onclick = loadDashboard;
  $("refreshTransactionsBtn").onclick = loadTransactions;
  $("transactionSearch").oninput = renderTransactionTable;
  $("transactionDate").onchange = loadTransactions;
  $("productDbSearch").oninput = renderProductTable;
  $("addProductBtn").onclick = ()=>openProductModal();
  $("saveProductBtn").onclick = saveProduct;
  $("refreshReportsBtn").onclick = loadReport;
  $("loadReportBtn").onclick = loadReport;
  document.querySelectorAll(".pay-method").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".pay-method").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    selectedPayment=b.dataset.method;
    updateChange();
  });
  document.querySelectorAll(".close-modal").forEach(b=>b.onclick=closeProductModal);
}

async function login(){
  if(!supabaseClient) return;
  const email=$("loginEmail").value.trim(), password=$("loginPassword").value;
  if(!email||!password){showMessage("loginMessage","Enter email and password.","error");return;}
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error) showMessage("loginMessage",error.message,"error");
}
async function logout(){
  if(supabaseClient) await supabaseClient.auth.signOut();
}
async function startApp(session){
  $("loginOverlay").classList.add("hidden");
  setCloud(true,"● Cloud Connected");
  $("cashierName").textContent=session.user.email || "Cashier";
  await loadProducts();
  await loadDashboard();
}

function setCloud(online,text){
  const el=$("cloudStatus");
  el.textContent=text;
  el.classList.toggle("online",online);
  el.classList.toggle("offline",!online);
}

async function loadProducts(){
  if(!supabaseClient) return;
  const {data,error}=await supabaseClient.from("pos_products").select("*").eq("active",true).order("name");
  if(error){showMessage("posMessage",error.message,"error");return;}
  products=data||[];
  buildCategories();
  renderProductGrid();
  renderProductTable();
}
function buildCategories(){
  const current=$("categoryFilter").value;
  const cats=[...new Set(products.map(p=>p.category).filter(Boolean))].sort();
  $("categoryFilter").innerHTML='<option value="">All Categories</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("categoryFilter").value=current;
}
function renderProductGrid(){
  const q=$("productSearch").value.trim().toLowerCase();
  const cat=$("categoryFilter").value;
  const list=products.filter(p=>(!q||p.name.toLowerCase().includes(q))&&(!cat||p.category===cat));
  $("productGrid").innerHTML=list.length?list.map(p=>`
    <button class="product-card" onclick="addToCart(${p.id})">
      <strong>${esc(p.name)}</strong>
      <small>${esc(p.category||"")}${p.unit?` • ${esc(p.unit)}`:""}</small>
      <span class="product-price">${money(p.price)}</span>
    </button>`).join(""):'<div class="empty">No products found.</div>';
}
function addToCart(id){
  const p=products.find(x=>Number(x.id)===Number(id)); if(!p)return;
  const line=cart.find(x=>Number(x.product_id)===Number(id));
  if(line) line.quantity++;
  else cart.push({product_id:p.id,name:p.name,unit:p.unit,price:Number(p.price),quantity:1});
  renderCart();
}
function renderCart(){
  $("cartCount").textContent=`${cart.reduce((s,x)=>s+x.quantity,0)} items`;
  $("cartItems").innerHTML=cart.length?cart.map((x,i)=>`
    <div class="cart-line">
      <div><div class="cart-line-title">${esc(x.name)}</div><small>${money(x.price)} × ${x.quantity}</small>
        <div class="cart-controls">
          <button class="qty-btn" onclick="changeQty(${i},-1)">−</button>
          <span>${x.quantity}</span>
          <button class="qty-btn" onclick="changeQty(${i},1)">+</button>
          <button class="remove-btn" onclick="removeCart(${i})">Remove</button>
        </div>
      </div><strong>${money(x.price*x.quantity)}</strong>
    </div>`).join(""):'<div class="empty">No items in cart.</div>';
  const total=getTotal();
  $("subtotal").textContent=money(total);
  $("total").textContent=money(total);
  updateChange();
}
function changeQty(i,d){cart[i].quantity+=d;if(cart[i].quantity<=0)cart.splice(i,1);renderCart()}
function removeCart(i){cart.splice(i,1);renderCart()}
function clearCart(){cart=[];$("customerName").value="";$("amountReceived").value="";renderCart()}
function getTotal(){return cart.reduce((s,x)=>s+x.price*x.quantity,0)}
function updateChange(){
  const total=getTotal(), received=Number($("amountReceived").value)||0;
  $("changeAmount").textContent=money(Math.max(0,received-total));
}

async function completeSale(){
  if(!supabaseClient)return;
  if(!cart.length){showMessage("posMessage","Add at least one product.","error");return}
  const total=getTotal(), received=Number($("amountReceived").value)||0;
  if(selectedPayment==="Cash" && received<total){showMessage("posMessage","Cash received is less than the total.","error");return}
  if(selectedPayment!=="Cash" && received<=0) $("amountReceived").value=total;
  const finalReceived=selectedPayment==="Cash"?received:total;
  const change=selectedPayment==="Cash"?Math.max(0,received-total):0;

  const {data:{user}}=await supabaseClient.auth.getUser();
  const transactionNumber=await getNextTransactionNumber();
  const payload={
    transaction_number:transactionNumber,
    customer_name:$("customerName").value.trim()||"Walk-in Customer",
    items:cart,
    subtotal:total,
    total:total,
    payment_method:selectedPayment,
    amount_received:finalReceived,
    change_amount:change,
    status:"Completed",
    cashier_email:user?.email||null
  };
  const {data,error}=await supabaseClient.from("pos_transactions").insert(payload).select().single();
  if(error){showMessage("posMessage",error.message,"error");return}
  buildReceipt(data);
  window.print();
  clearCart();
  showMessage("posMessage",`Transaction ${transactionNumber} completed.`,"success");
  await loadDashboard();
}
async function getNextTransactionNumber(){
  const {data,error}=await supabaseClient.rpc("next_pos_transaction_number");
  if(error) throw error;
  return data;
}
function buildReceipt(t){

  // Receipt-specific money format.
  // We intentionally use "PHP" instead of "₱"
  // because the thermal printer may not support the ₱ character.
  const receiptMoney = n => `PHP ${Number(n || 0).toFixed(2)}`;

  const itemRows = (t.items || []).map(x => `
    <div class="receipt-item">
      <span class="receipt-item-name">
        ${esc(x.quantity)} x ${receiptMoney(x.price)}
      </span>
    </div>
  `).join("");

  $("receiptPrintArea").innerHTML = `

    <!-- COMPANY HEADER -->
    <div class="receipt-company">
      PRINTART CREATIVE
    </div>

    <div class="receipt-subtitle">
      GRAPHIC & SIGNS
    </div>

    <!-- COMPANY INFORMATION -->
    <div class="receipt-address">
      C'Arcade Building,Unit 9,2/F
    </div>

    <div class="receipt-address">
      Camachiles, Mabalacat City
    </div>

    <div class="receipt-address">
      Pampanga
    </div>

    <div class="receipt-spacer"></div>

    <div class="receipt-contact">
      Viber: 0961-517-9028
    </div>

    <div class="receipt-contact">
      printartcreative.kr@gmail.com
    </div>

    <div class="receipt-line"></div>

    <!-- CUSTOMER -->
    <div class="receipt-section-title">
      CUSTOMER:
    </div>

    <div class="receipt-customer">
      ${esc(t.customer_name || "Walk-in Customer")}
    </div>

    <div class="receipt-spacer"></div>

    <!-- ITEMS -->
    <div class="receipt-items">
      ${itemRows}
    </div>

    <div class="receipt-line"></div>

    <!-- TOTAL -->
    <div class="receipt-row receipt-total-row">
      <span>TOTAL:</span>
      <span>${receiptMoney(t.total)}</span>
    </div>

    <div class="receipt-line"></div>

    <!-- PAYMENT -->
    <div class="receipt-payment">

      <div class="receipt-row">
        <span>PAYMENT:</span>
        <span>${esc(t.payment_method || "")}</span>
      </div>

      <div class="receipt-spacer"></div>

      <div class="receipt-row">
        <span>AMOUNT PAID:</span>
        <span>${receiptMoney(t.amount_received)}</span>
      </div>

      <div class="receipt-spacer"></div>

      <div class="receipt-row">
        <span>CHANGE:</span>
        <span>${receiptMoney(t.change_amount)}</span>
      </div>

    </div>

    <div class="receipt-line"></div>

    <!-- THANK YOU -->
    <div class="receipt-thanks">
      <div>THANK YOU!</div>
      <div>Please come again.</div>
    </div>

  `;
}
    <div class="footer">
      PRINTART CREATIVE GRAPHIC AND SIGNS
    </div>

  `;
}

async function loadDashboard(){
  if(!supabaseClient)return;
  const start=`${todayISO()}T00:00:00`, end=`${todayISO()}T23:59:59.999`;
  const {data,error}=await supabaseClient.from("pos_transactions").select("*").gte("created_at",start).lte("created_at",end).eq("status","Completed").order("created_at",{ascending:false});
  if(error){console.error(error);return}
  const rows=data||[];
  setDashboard(rows);
  renderRecent(rows.slice(0,10));
}
function setDashboard(rows){
  $("dashSales").textContent=money(rows.reduce((s,x)=>s+Number(x.total),0));
  $("dashTransactions").textContent=rows.length;
  $("dashCash").textContent=money(sumPayment(rows,"Cash"));
  $("dashGcash").textContent=money(sumPayment(rows,"GCash"));
  $("dashMetro").textContent=money(sumPayment(rows,"Metrobank"));
}
function sumPayment(rows,method){return rows.filter(x=>x.payment_method===method).reduce((s,x)=>s+Number(x.total),0)}
function renderRecent(rows){
  $("recentTransactions").innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Time</th><th>Payment</th><th>Total</th></tr></thead><tbody>${rows.map(t=>`<tr><td>${esc(t.transaction_number)}</td><td>${formatDateTime(t.created_at)}</td><td>${esc(t.payment_method)}</td><td>${money(t.total)}</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">No transactions today.</div>';
}

async function loadTransactions(){
  if(!supabaseClient)return;
  const date=$("transactionDate").value||todayISO();
  const start=`${date}T00:00:00`, end=`${date}T23:59:59.999`;
  const {data,error}=await supabaseClient.from("pos_transactions").select("*").gte("created_at",start).lte("created_at",end).order("created_at",{ascending:false});
  if(error){console.error(error);return}
  transactions=data||[];
  renderTransactionTable();
}
function renderTransactionTable(){
  const q=$("transactionSearch").value.trim().toLowerCase();
  const rows=transactions.filter(t=>(t.transaction_number||"").toLowerCase().includes(q)||(t.customer_name||"").toLowerCase().includes(q));
  $("transactionTableBody").innerHTML=rows.length?rows.map(t=>`
    <tr>
      <td>${esc(t.transaction_number)}</td><td>${formatDateTime(t.created_at)}</td><td>${esc(t.customer_name)}</td>
      <td>${esc(t.payment_method)}</td><td>${money(t.total)}</td>
      <td><span class="badge ${t.status==="Completed"?"completed":"voided"}">${esc(t.status)}</span></td>
      <td><button class="btn small" onclick="reprintTransaction(${t.id})">Reprint</button>${t.status==="Completed"?` <button class="btn small" onclick="voidTransaction(${t.id})">Void</button>`:""}</td>
    </tr>`).join(""):'<tr><td colspan="7" class="empty">No transactions found.</td></tr>';
}
async function reprintTransaction(id){
  const t=transactions.find(x=>Number(x.id)===Number(id));if(!t)return;
  buildReceipt(t);window.print();
}
async function voidTransaction(id){
  if(!confirm("Void this transaction? This will mark it as Voided and remove it from sales totals."))return;
  const {error}=await supabaseClient.from("pos_transactions").update({status:"Voided"}).eq("id",id);
  if(error){alert(error.message);return}
  await loadTransactions();await loadDashboard();await loadReport();
}

function renderProductTable(){
  const q=($("productDbSearch").value||"").toLowerCase();
  const list=products.filter(p=>p.name.toLowerCase().includes(q));
  $("productTableBody").innerHTML=list.length?list.map(p=>`
    <tr><td>${esc(p.name)}</td><td>${esc(p.category||"")}</td><td>${esc(p.unit||"")}</td><td>${money(p.price)}</td>
    <td>${p.active?"Active":"Inactive"}</td><td><button class="btn small" onclick="editProduct(${p.id})">Edit</button> <button class="btn small" onclick="toggleProduct(${p.id},${p.active})">${p.active?"Deactivate":"Activate"}</button></td></tr>`).join(""):'<tr><td colspan="6" class="empty">No products.</td></tr>';
}
function openProductModal(p=null){
  editingProductId=p?.id||null;
  $("productModalTitle").textContent=p?"Edit Product":"Add Product";
  $("productId").value=p?.id||"";
  $("productName").value=p?.name||"";
  $("productCategory").value=p?.category||"";
  $("productUnit").value=p?.unit||"";
  $("productPrice").value=p?.price??"";
  $("productActive").checked=p?.active??true;
  $("productMessage").textContent="";
  $("productModal").classList.remove("hidden");
}
function closeProductModal(){$("productModal").classList.add("hidden")}
function editProduct(id){const p=products.find(x=>Number(x.id)===Number(id));if(p)openProductModal(p)}
async function saveProduct(){
  const payload={name:$("productName").value.trim(),category:$("productCategory").value.trim()||null,unit:$("productUnit").value.trim()||null,price:Number($("productPrice").value)||0,active:$("productActive").checked};
  if(!payload.name){showMessage("productMessage","Product name is required.","error");return}
  let result;
  if(editingProductId) result=await supabaseClient.from("pos_products").update(payload).eq("id",editingProductId);
  else result=await supabaseClient.from("pos_products").insert(payload);
  if(result.error){showMessage("productMessage",result.error.message,"error");return}
  closeProductModal();await loadProducts();
}
async function toggleProduct(id,current){
  const {error}=await supabaseClient.from("pos_products").update({active:!current}).eq("id",id);
  if(error){alert(error.message);return} await loadProducts();
}

async function loadReport(){
  if(!supabaseClient)return;
  const date=$("reportDate").value||todayISO();
  const {data,error}=await supabaseClient.from("pos_transactions").select("*").gte("created_at",`${date}T00:00:00`).lte("created_at",`${date}T23:59:59.999`).eq("status","Completed");
  if(error){console.error(error);return}
  const rows=data||[];
  $("reportSales").textContent=money(rows.reduce((s,x)=>s+Number(x.total),0));
  $("reportTransactions").textContent=rows.length;
  $("reportCash").textContent=money(sumPayment(rows,"Cash"));
  $("reportGcash").textContent=money(sumPayment(rows,"GCash"));
  $("reportMetro").textContent=money(sumPayment(rows,"Metrobank"));
}

function formatDateTime(v){return v?new Date(v).toLocaleString("en-PH",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):""}
function esc(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function showMessage(id,msg,type=""){const el=$(id);if(!el)return;el.textContent=msg;el.className=`message ${type}`}
window.addToCart=addToCart;window.changeQty=changeQty;window.removeCart=removeCart;window.reprintTransaction=reprintTransaction;window.voidTransaction=voidTransaction;window.editProduct=editProduct;window.toggleProduct=toggleProduct;
