
  // Controladores de métodos de pago
  window.switchDmdPayTab = function(method) {
    const methods = ['card', 'mp', 'spei', 'oxxo', 'paypal'];
    methods.forEach(m => {
      const panel = document.getElementById('dmdPayPanel_' + m);
      const btn = document.getElementById('dmdPayTabBtn_' + m);
      if (panel) panel.style.display = (m === method) ? 'block' : 'none';
      if (btn) {
        if (m === method) {
          btn.style.border = '1.5px solid #2563eb';
          btn.style.background = '#eff6ff';
          btn.style.color = '#1e40af';
          btn.style.fontWeight = '800';
        } else {
          btn.style.border = '1px solid #cbd5e1';
          btn.style.background = '#ffffff';
          btn.style.color = '#334155';
          btn.style.fontWeight = '700';
        }
      }
    });
  };

  window.processCardPayment = function() {
    const card = document.getElementById('dmdCardNumber')?.value.trim();
    if (card && card.length < 15) {
      alert('Por favor ingresa un número de tarjeta válido (16 dígitos).');
      return;
    }
    window.activatePremiumSubscription('Tarjeta Bancaria');
  };

  window.processMercadoPagoPayment = function() {
    window.activatePremiumSubscription('Mercado Pago');
  };

  window.processPayPalPayment = function() {
    window.activatePremiumSubscription('PayPal');
  };
/**
 * DMD - REGISTRO CENTRAL DE CREACIONES Y PETICIONES IA
 * Conecta las herramientas de IA (dmd-paginas-web-ia.vercel.app, canva.html, posts.html, publicidad.html)
 * con el Portal de Clientes (portal.html) y la Consola de Administración (admin.html).
 * 100% Serverless, Offline-first via localStorage.
 */

(function () {
  const STORAGE_KEY = "dmd_ai_creations";

  // IDs de las creaciones de ejemplo que se sembraban antes. Una cuenta
  // nueva empieza EN LIMPIO: si la lista guardada trae SOLO estos IDs,
  // se considera vacía y se limpia (ver getDmdAiCreations).
  const SEED_CREATION_IDS = ["IA-WEB-9201", "IA-LOGO-8140", "IA-BAN-7305", "IA-POST-6112", "IA-PUB-5089", "IA-WEB-4981", "IA-LOGO-3890", "IA-POST-3120", "IA-PUB-2780", "IA-BAN-1994"];

  // Obtener todas las creaciones
  window.getDmdAiCreations = function () {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Las creaciones de ejemplo nunca fueron de ningún usuario: se
          // quitan de la lista. Si solo quedaban ejemplos, la cuenta
          // queda en limpio.
          const seedIds = new Set(SEED_CREATION_IDS);
          const real = parsed.filter(function (c) { return c && !seedIds.has(c.id); });
          if (real.length !== parsed.length) {
            if (real.length === 0) { localStorage.removeItem(STORAGE_KEY); }
            else { localStorage.setItem(STORAGE_KEY, JSON.stringify(real)); }
          }
          return real;
        }
      }
    } catch (e) {
      console.warn("Error leyendo dmd_ai_creations:", e);
    }
    // Cuenta nueva: en limpio, sin creaciones de ejemplo.
    return [];
  };

  // Guardar una nueva creación pedida por el cliente
  window.saveDmdAiCreation = function (data) {
    const list = window.getDmdAiCreations();
    
    // Obtener perfil actual del cliente
    let clientName = "Cliente DMD";
    let clientEmail = "";
    let clientCompany = "";
    if (typeof window.getClientProfile === "function") {
      const p = window.getClientProfile();
      if (p && p.name) clientName = p.name;
      if (p && p.email) clientEmail = p.email;
      if (p && p.company) clientCompany = p.company;
    }

    const typePrefix = {
      web: "IA-WEB-",
      logo: "IA-LOGO-",
      banner: "IA-BAN-",
      post: "IA-POST-",
      publicidad: "IA-PUB-"
    }[data.type] || "IA-GEN-";

    const randomFolio = typePrefix + Math.floor(1000 + Math.random() * 9000);
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const currentSub = (typeof window.getDmdIaSubscription === "function") ? window.getDmdIaSubscription() : null;
    const isPremiumUser = Boolean(currentSub && currentSub.isPremium);

    const newRecord = {
      id: data.id || randomFolio,
      type: data.type || "post",
      typeLabel: data.typeLabel || getLabelForType(data.type),
      typeBadgeClass: getBadgeForType(data.type),
      typeIcon: getIconForType(data.type),
      title: data.title || (data.prompt ? data.prompt.substring(0, 40) + "..." : "Creación con IA"),
      userName: data.userName || clientName,
      userEmail: data.userEmail || clientEmail,
      userCompany: data.userCompany || clientCompany,
      plan: isPremiumUser ? "DMD IA Premium ($79 MXN)" : "Plan Libre (Gratuito)",
      isPremiumUser: isPremiumUser,
      prompt: data.prompt || "Diseño asistido por inteligencia artificial",
      model: data.model || getModelForType(data.type),
      date: formattedDate,
      timestamp: Date.now(),
      status: data.status || "Completado",
      downloadType: data.downloadType || "PNG / SVG",
      source: data.source || window.location.pathname.split("/").pop() || "dmd-paginas-web-ia.vercel.app",
      accent: data.accent || "#6366f1",
      summary: data.summary || "Generación automática realizada exitosamente según los requerimientos solicitados."
    };

    // Prepend a la lista
    list.unshift(newRecord);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error("Error guardando dmd_ai_creations:", e);
    }

    // Mostrar notificación visual
    showToastNotification(`✨ ¡Petición IA registrada! Guardada en tu Portal de Cliente y en la Consola Admin.`);

    return newRecord;
  };

  function getLabelForType(t) {
    switch (t) {
      case "web": return "Página Web Corporativa";
      case "logo": return "Logotipo Vectorial";
      case "banner": return "Banner Promocional";
      case "post": return "Post para Redes Sociales";
      case "publicidad": return "Anuncio / Flyer Comercial";
      default: return "Diseño Gráfico IA";
    }
  }

  function getBadgeForType(t) {
    switch (t) {
      case "web": return "badge-primary";
      case "logo": return "badge-accent";
      case "banner": return "badge-info";
      case "post": return "badge-success";
      case "publicidad": return "badge-warning";
      default: return "badge-secondary";
    }
  }

  function getIconForType(t) {
    switch (t) {
      case "web": return "🌐";
      case "logo": return "🎨";
      case "banner": return "🖼️";
      case "post": return "📱";
      case "publicidad": return "📢";
      default: return "✨";
    }
  }

  function getModelForType(t) {
    switch (t) {
      case "web": return "DMD Lovable AI Web Engine v3.4";
      case "logo": return "Canva Studio IA (Vector Logo Generator)";
      case "banner": return "Canva Studio IA (Banner Studio Pro)";
      case "post": return "Social Posts IA Studio";
      case "publicidad": return "Commercial Flyer & Adverts Engine";
      default: return "DMD Artificial Intelligence Core";
    }
  }

  function showToastNotification(msg) {
    let container = document.getElementById("dmdToastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "dmdToastContainer";
      container.className = "toast-container";
      container.style.cssText = "position:fixed; bottom:20px; right:20px; z-index:99999; display:flex; flex-direction:column; gap:10px;";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.style.cssText = "background:#0f172a; color:#f8fafc; border:1px solid #6366f1; border-radius:8px; padding:12px 18px; font-size:0.86rem; box-shadow:0 10px 25px rgba(0,0,0,0.3); display:flex; align-items:center; gap:10px; max-width:380px; animation:fadeIn 0.3s ease forwards;";
    toast.innerHTML = `<span style="font-size:1.2rem;">✨</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.4s ease";
      setTimeout(() => toast.remove(), 400);
    }, 4500);
  }

  // =========================================================================
  // VISTA PARA EL PORTAL DEL CLIENTE (portal.html)
  // =========================================================================
  window.renderClientAiCreations = function (filterType = "all") {
    const container = document.getElementById("clientAiCreationsTableBody");
    const gridContainer = document.getElementById("clientAiCreationsGrid");
    const countBadge = document.getElementById("clientAiTotalBadge");
    if (!container && !gridContainer) return;

    const allCreations = window.getDmdAiCreations();
    // Filtramos para mostrar las creaciones del cliente logueado (o todas las que correspondan al cliente)
    const clientCreations = allCreations.filter(item => {
      if (filterType !== "all" && item.type !== filterType) return false;
      return true; // En el portal se muestran todas las que el cliente o la empresa ha solicitado
    });

    if (countBadge) countBadge.textContent = clientCreations.length;

    // Renderizado en Tabla
    if (container) {
      if (clientCreations.length === 0) {
        container.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">No se encontraron creaciones con el filtro seleccionado.</td></tr>`;
      } else {
        container.innerHTML = clientCreations.map(c => `
          <tr>
            <td>
              <strong style="color:var(--primary); font-family:monospace; font-size:0.85rem;">${c.id}</strong>
            </td>
            <td>
              <span class="badge ${c.typeBadgeClass}" style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:0.75rem;">
                ${c.typeIcon} ${c.typeLabel}
              </span>
            </td>
            <td>
              <div style="font-weight:700; color:var(--text-main); font-size:0.88rem;">${c.title}</div>
              <div style="font-size:0.76rem; color:var(--text-muted); max-width:320px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.prompt}">
                💬 "${c.prompt}"
              </div>
            </td>
            <td style="font-size:0.8rem; color:var(--text-body);">${c.date}</td>
            <td>
              <span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:12px; font-size:0.75rem; font-weight:700; display:inline-block;">
                ● ${c.status}
              </span>
            </td>
            <td>
              <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-secondary" onclick="window.openAiDetailModal('${c.id}')" style="padding:4px 8px; font-size:0.75rem;" title="Ver Detalle y Prompt">
                  👁️ Ver
                </button>
                <a href="${c.source}" class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem; text-decoration:none;" title="Abrir en Diseñador IA">
                  ⚡ Abrir
                </a>
              </div>
            </td>
          </tr>
        `).join("");
      }
    }

    // Renderizado en Cuadrícula / Tarjetas (si existe gridContainer)
    if (gridContainer) {
      gridContainer.innerHTML = clientCreations.map(c => `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:18px; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span class="badge ${c.typeBadgeClass}" style="padding:3px 8px; font-size:0.75rem; border-radius:4px;">
                ${c.typeIcon} ${c.typeLabel}
              </span>
              <span style="font-family:monospace; font-size:0.78rem; font-weight:700; color:var(--primary);">${c.id}</span>
            </div>
            <h4 style="margin:0 0 6px 0; font-size:0.95rem; font-weight:800; color:var(--text-main);">${c.title}</h4>
            <p style="font-size:0.8rem; color:var(--text-muted); line-height:1.4; margin-bottom:12px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
              "${c.prompt}"
            </p>
          </div>
          <div style="border-top:1px solid #f1f5f9; padding-top:12px; margin-top:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.76rem; color:#64748b; margin-bottom:12px;">
              <span>📅 ${c.date}</span>
              <span style="color:#16a34a; font-weight:700;">● ${c.status}</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-secondary" onclick="window.openAiDetailModal('${c.id}')" style="flex:1; padding:6px 0; font-size:0.78rem; justify-content:center;">
                👁️ Detalle
              </button>
              <a href="${c.source}" class="btn btn-primary" style="flex:1; padding:6px 0; font-size:0.78rem; justify-content:center; text-decoration:none;">
                ⚡ Diseñador
              </a>
            </div>
          </div>
        </div>
      `).join("");
    }
  };

  // =========================================================================
  // VISTA PARA EL PANEL DE ADMINISTRACIÓN (admin.html)
  // =========================================================================
  window.adminRenderAiLogsTable = function (filterUser = "all", filterType = "all", searchQuery = "") {
    const tableBody = document.getElementById("adminAiLogsTableBody");
    const userSelect = document.getElementById("adminAiUserFilter");
    const totalCountEl = document.getElementById("adminAiTotalCount");
    const kpiWebs = document.getElementById("adminKpiAiWebs");
    const kpiLogos = document.getElementById("adminKpiAiLogos");
    const kpiPosts = document.getElementById("adminKpiAiPosts");
    const kpiAds = document.getElementById("adminKpiAiAds");

    const allCreations = window.getDmdAiCreations();

    // Actualizar KPIs generales
    if (totalCountEl) totalCountEl.textContent = allCreations.length;
    if (kpiWebs) kpiWebs.textContent = allCreations.filter(c => c.type === "web").length;
    if (kpiLogos) kpiLogos.textContent = allCreations.filter(c => c.type === "logo" || c.type === "banner").length;
    if (kpiPosts) kpiPosts.textContent = allCreations.filter(c => c.type === "post").length;
    if (kpiAds) kpiAds.textContent = allCreations.filter(c => c.type === "publicidad").length;

    // Poblar dropdown de usuarios únicos si existe
    if (userSelect && userSelect.options && userSelect.options.length <= 1) {
      const uniqueUsers = [...new Set(allCreations.map(c => c.userName))];
      uniqueUsers.forEach(u => {
        const opt = document.createElement("option");
        opt.value = u;
        opt.textContent = `👤 ${u}`;
        userSelect.appendChild(opt);
      });
    }

    // Filtrar creaciones
    let filtered = allCreations.filter(c => {
      if (filterUser !== "all" && c.userName !== filterUser) return false;
      if (filterType !== "all" && c.type !== filterType) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (c.title || "").toLowerCase().includes(q);
        const matchPrompt = (c.prompt || "").toLowerCase().includes(q);
        const matchUser = (c.userName || "").toLowerCase().includes(q);
        const matchFolio = (c.id || "").toLowerCase().includes(q);
        if (!matchTitle && !matchPrompt && !matchUser && !matchFolio) return false;
      }
      return true;
    });

    if (!tableBody) return;

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:35px; color:var(--text-muted);">No hay peticiones que coincidan con los filtros seleccionados.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map(c => `
      <tr>
        <td>
          <span style="font-family:monospace; font-weight:800; color:var(--primary); font-size:0.84rem;">${c.id}</span>
        </td>
        <td>
          <div style="font-weight:700; color:var(--text-main); font-size:0.86rem; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span style="width:24px; height:24px; border-radius:50%; background:#e0e7ff; color:#4338ca; display:inline-flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800;">
              ${c.userName.substring(0, 2).toUpperCase()}
            </span>
            <span>${c.userName}</span>
            ${(c.isPremiumUser || (c.plan && c.plan.includes("Premium")))
              ? '<span class="badge" style="background:#fef08a; color:#854d0e; font-size:0.67rem; font-weight:800; border:1px solid #facc15; padding:2px 7px; border-radius:99px; display:inline-flex; align-items:center; gap:3px;">⭐ DMD Premium ($79 MXN)</span>'
              : '<span class="badge" style="background:#f1f5f9; color:#475569; font-size:0.67rem; font-weight:700; border:1px solid #cbd5e1; padding:2px 7px; border-radius:99px;">Plan Libre (Limitado)</span>'
            }
          </div>
          <div style="font-size:0.75rem; color:#64748b; margin-left:30px; margin-top:2px;">${c.userEmail} · ${c.userCompany}</div>
        </td>
        <td>
          <span class="badge ${c.typeBadgeClass}" style="padding:2px 8px; font-size:0.74rem; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
            ${c.typeIcon} ${c.typeLabel}
          </span>
          <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">⚙️ ${c.model}</div>
        </td>
        <td>
          <div style="font-weight:700; font-size:0.84rem; color:var(--text-main);">${c.title}</div>
          <div style="font-size:0.77rem; color:var(--text-body); max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${c.prompt}">
            💬 "${c.prompt}"
          </div>
        </td>
        <td style="font-size:0.78rem; color:#64748b; white-space:nowrap;">${c.date}</td>
        <td>
          <select onchange="window.updateAiCreationStatus('${c.id}', this.value)" style="padding:3px 6px; font-size:0.75rem; border-radius:4px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:600; color:#1e293b;">
            <option value="Completado" ${c.status === "Completado" ? "selected" : ""}>🟢 Completado</option>
            <option value="En Revisión" ${c.status === "En Revisión" ? "selected" : ""}>🟡 En Revisión</option>
            <option value="Entregado" ${c.status === "Entregado" ? "selected" : ""}>🔵 Entregado</option>
            <option value="Archivado" ${c.status === "Archivado" ? "selected" : ""}>⚪ Archivado</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:5px;">
            <button type="button" class="btn btn-secondary" onclick="window.openAiDetailModal('${c.id}')" style="padding:3px 7px; font-size:0.74rem;" title="Ver Detalle Completo">
              👁️
            </button>
            <button type="button" class="btn btn-danger" onclick="window.deleteAiCreation('${c.id}')" style="padding:3px 7px; font-size:0.74rem;" title="Eliminar Registro">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  };

  // Actualizar estado de una creación
  window.updateAiCreationStatus = function (id, newStatus) {
    const list = window.getDmdAiCreations();
    const item = list.find(c => c.id === id);
    if (item) {
      item.status = newStatus;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      showToastNotification(`Estatus de ${id} actualizado a "${newStatus}".`);
      if (typeof window.renderClientAiCreations === "function") window.renderClientAiCreations();
    }
  };

  // Eliminar un registro de creación
  window.deleteAiCreation = function (id) {
    if (!confirm(`¿Deseas eliminar el registro ${id}?`)) return;
    let list = window.getDmdAiCreations();
    list = list.filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    showToastNotification(`Registro ${id} eliminado del historial.`);
    const userVal = document.getElementById("adminAiUserFilter")?.value || "all";
    const typeVal = document.getElementById("adminAiTypeFilter")?.value || "all";
    const searchVal = document.getElementById("adminAiSearchInput")?.value || "";
    window.adminRenderAiLogsTable(userVal, typeVal, searchVal);
    if (typeof window.renderClientAiCreations === "function") window.renderClientAiCreations();
  };

  // =========================================================================
  // MODAL DE DETALLE DE PETICIÓN IA
  // =========================================================================
  window.openAiDetailModal = function (id) {
    const list = window.getDmdAiCreations();
    const item = list.find(c => c.id === id);
    if (!item) return;

    let modal = document.getElementById("modalAiCreationDetail");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modalAiCreationDetail";
      modal.className = "modal-overlay";
      modal.innerHTML = `
        <div class="modal-card" style="max-width:650px; border-radius:14px; overflow:hidden; background:#ffffff; box-shadow:0 20px 40px rgba(0,0,0,0.25);">
          <div style="background:linear-gradient(135deg, #0b1329 0%, #1e1b4b 100%); color:#ffffff; padding:18px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:0.75rem; color:#818cf8; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Detalle de Petición con IA</div>
              <h3 id="modalAiTitle" style="margin:2px 0 0 0; font-size:1.15rem; color:#ffffff;">Título de la Creación</h3>
            </div>
            <button type="button" onclick="window.closeAiDetailModal()" style="background:none; border:none; color:#cbd5e1; font-size:1.4rem; cursor:pointer; line-height:1;">&times;</button>
          </div>
          <div style="padding:24px; font-size:0.88rem; color:var(--text-main); max-height:75vh; overflow-y:auto;" id="modalAiBody">
            <!-- Contenido dinámico -->
          </div>
          <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:12px 24px; display:flex; justify-content:space-between; align-items:center;">
            <div id="modalAiFooterFolio" style="font-family:monospace; font-weight:700; color:var(--primary);">IA-0000</div>
            <div style="display:flex; gap:10px;">
              <a href="#" id="modalAiSourceBtn" class="btn btn-primary" style="padding:6px 14px; font-size:0.82rem; text-decoration:none;">
                ⚡ Abrir Herramienta IA
              </a>
              <button type="button" class="btn btn-secondary" onclick="window.closeAiDetailModal()" style="padding:6px 14px; font-size:0.82rem;">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    document.getElementById("modalAiTitle").textContent = item.title;
    document.getElementById("modalAiFooterFolio").textContent = item.id;
    const sourceBtn = document.getElementById("modalAiSourceBtn");
    if (sourceBtn) sourceBtn.href = item.source;

    document.getElementById("modalAiBody").innerHTML = `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; background:#f8fafc; padding:12px 16px; border-radius:8px; border:1px solid #e2e8f0;">
        <div>
          <span style="font-size:0.75rem; color:#64748b; display:block;">Cliente Solicitante:</span>
          <strong>${item.userName}</strong>
          <div style="font-size:0.76rem; color:#64748b;">${item.userEmail}</div>
        </div>
        <div>
          <span style="font-size:0.75rem; color:#64748b; display:block;">Empresa / Organización:</span>
          <strong>${item.userCompany}</strong>
          <div style="font-size:0.76rem; color:#64748b;">Fecha: ${item.date}</div>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:0.76rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
          💬 Prompt / Instrucción Exacta Solicitada por el Cliente:
        </label>
        <div style="background:#0f172a; color:#38bdf8; padding:14px; border-radius:8px; font-size:0.84rem; line-height:1.5; font-family:monospace; border-left:4px solid #6366f1;">
          "${item.prompt}"
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:0.76rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
          🤖 Motor &amp; Modelo de IA Empleado:
        </label>
        <div style="background:#f1f5f9; padding:8px 12px; border-radius:6px; font-weight:600; color:#334155; font-size:0.82rem; display:inline-block;">
          ${item.model}
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="font-size:0.76rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.04em; display:block; margin-bottom:6px;">
          📋 Resumen de Entrega &amp; Formato:
        </label>
        <p style="margin:0 0 6px 0; color:var(--text-body); font-size:0.85rem; line-height:1.4;">
          ${item.summary}
        </p>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <span style="background:#e0f2fe; color:#0369a1; padding:3px 10px; border-radius:12px; font-size:0.76rem; font-weight:700;">
            📦 Formato: ${item.downloadType}
          </span>
          <span style="background:#dcfce7; color:#15803d; padding:3px 10px; border-radius:12px; font-size:0.76rem; font-weight:700;">
            ● Estado: ${item.status}
          </span>
        </div>
      </div>
    `;

    modal.classList.add("active");
  };

  window.closeAiDetailModal = function () {
    const modal = document.getElementById("modalAiCreationDetail");
    if (modal) modal.classList.remove("active");
  };

  // =========================================================================
  // SISTEMA DE SUSCRIPCIÓN DMD IA PREMIUM ($79 MXN / MES)
  // Ideas limitadas en plan gratuito, desbloqueo de rediseño y plantillas VIP
  // =========================================================================
  const SUB_STORAGE_KEY = "dmd_ia_subscription";
  const DEFAULT_SUBSCRIPTION = {
    isPremium: false,
    plan: "DMD IA Básico (Gratuito)",
    price: 79, // Menos de 100 pesos
    currency: "MXN",
    freeGenerationsLeft: 3, // 3 ideas de cortesía
    maxFree: 3,
    subscribedDate: null
  };

  window.getDmdSubscription = function () {
    try {
      const stored = localStorage.getItem(SUB_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Error leyendo dmd_ia_subscription:", e);
    }
    localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(DEFAULT_SUBSCRIPTION));
    return { ...DEFAULT_SUBSCRIPTION };
  };

  window.checkCanGenerateAi = function (actionName = "generar ideas") {
    const sub = window.getDmdSubscription();
    if (sub.isPremium) return true;

    if (sub.freeGenerationsLeft > 0) {
      return true;
    }

    // Límite alcanzado -> Desplegar Paywall Modal
    window.openPremiumSubscriptionModal(
      `Has alcanzado el límite de ${sub.maxFree} ideas gratuitas de IA para ${actionName}. Para seguir generando nuevas ideas, rediseñar y acceder a plantillas exclusivas, suscríbete a DMD IA Premium por solo $79 MXN/mes.`
    );
    return false;
  };

  window.consumeAiGenerationCredit = function (actionName = "generar") {
    const sub = window.getDmdSubscription();
    if (sub.isPremium) return true;

    sub.freeGenerationsLeft = Math.max(0, (sub.freeGenerationsLeft || DEFAULT_SUBSCRIPTION.maxFree) - 1);
    localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(sub));
    window.updateSubscriptionUI();

    if (sub.freeGenerationsLeft === 0) {
      showToastNotification(`⚠️ Has utilizado tu última idea gratuita con IA. Para seguir generando y rediseñando sin restricciones, suscríbete a DMD IA Premium ($79 MXN/mes).`);
    } else {
      showToastNotification(`💡 Idea con IA procesada. Te quedan ${sub.freeGenerationsLeft} de ${sub.maxFree} ideas gratuitas. Activa DMD IA Premium ($79 MXN) para ilimitadas.`);
    }
    return true;
  };

  window.checkTemplateAccess = function (isPremiumTemplate = false, templateLabel = "Plantilla") {
    if (!isPremiumTemplate) return true;
    const sub = window.getDmdSubscription();
    if (sub.isPremium) return true;

    window.openPremiumSubscriptionModal(
      `La plantilla VIP "${templateLabel}" es exclusiva para suscriptores de DMD IA Premium. Desbloquéala junto con todo el catálogo por solo $79 MXN/mes.`
    );
    return false;
  };

  window.activatePremiumSubscription = function () {
    const sub = window.getDmdSubscription();
    sub.isPremium = true;
    sub.plan = "DMD IA Premium";
    sub.subscribedDate = new Date().toISOString();
    sub.freeGenerationsLeft = 99999;
    localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(sub));

    window.closePremiumSubscriptionModal();
    window.updateSubscriptionUI();
    showToastNotification(`🎉 ¡Felicidades! Tu suscripción DMD IA Premium ($79 MXN/mes) está ACTIVA. Tienes ideas ilimitadas y todas las plantillas VIP desbloqueadas.`);

    if (typeof window.renderClientAiCreations === "function") window.renderClientAiCreations();
    if (typeof window.adminRenderAiLogsTable === "function") window.adminRenderAiLogsTable();
  };

  window.cancelPremiumSubscription = function () {
    if (!confirm("¿Deseas cancelar tu suscripción DMD IA Premium y volver al modo gratuito limitado?")) return;
    const sub = { ...DEFAULT_SUBSCRIPTION, freeGenerationsLeft: 0 };
    localStorage.setItem(SUB_STORAGE_KEY, JSON.stringify(sub));
    window.updateSubscriptionUI();
    showToastNotification("Has vuelto al plan gratuito limitado.");
    if (typeof window.renderClientAiCreations === "function") window.renderClientAiCreations();
  };

  window.openPremiumSubscriptionModal = function (reasonText = "") {
    let modal = document.getElementById("modalDmdIaPremium");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modalDmdIaPremium";
      modal.className = "modal-overlay";
      modal.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); z-index:999999; display:none; align-items:center; justify-content:center; padding:16px;";
      modal.innerHTML = `
        <div class="modal-card" style="max-width:620px; width:100%; border-radius:18px; overflow:hidden; background:#ffffff; box-shadow:0 25px 60px rgba(0,0,0,0.4); border:1px solid rgba(99,102,241,0.3); animation:modalPop 0.3s ease;">
          <!-- Cabecera Premium -->
          <div style="background:linear-gradient(135deg, #0b0f19 0%, #1e1b4b 50%, #312e81 100%); color:#ffffff; padding:24px 28px; position:relative;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(99,102,241,0.25); border:1px solid #818cf8; padding:4px 12px; border-radius:99px; font-size:0.75rem; font-weight:800; color:#c7d2fe; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px;">
                ⭐ Membresía de Acceso Total
              </div>
              <button type="button" onclick="window.closePremiumSubscriptionModal()" style="background:none; border:none; color:#cbd5e1; font-size:1.6rem; cursor:pointer; line-height:1; padding:0 4px;">&times;</button>
            </div>
            <h2 style="margin:0 0 6px 0; font-size:1.45rem; font-weight:900; color:#ffffff; display:flex; align-items:center; gap:10px;">
              DMD IA Premium
              <span style="background:#f59e0b; color:#78350f; font-size:0.72rem; padding:2px 8px; border-radius:6px; font-weight:900;">ILIMITADO</span>
            </h2>
            <p style="margin:0; font-size:0.86rem; color:#cbd5e1; line-height:1.4;">
              Genera tantas ideas como quieras, rediseña con IA en segundos y desbloquea todas las plantillas exclusivas.
            </p>

            <!-- Tarjeta de Precio Ultra Accesible -->
            <div style="position:absolute; right:28px; bottom:20px; text-align:right;">
              <div style="font-size:0.75rem; color:#a5b4fc; font-weight:700; text-transform:uppercase;">Solo por</div>
              <div style="font-size:1.9rem; font-weight:900; color:#38bdf8; line-height:1;">$79 <span style="font-size:0.9rem; color:#cbd5e1; font-weight:700;">MXN</span></div>
              <div style="font-size:0.72rem; color:#94a3b8; font-weight:600;">/ mes (Menos de $100)</div>
            </div>
          </div>

          <!-- Cuerpo Modal con Motivo y Comparativa -->
          <div style="padding:24px 28px; max-height:70vh; overflow-y:auto;">
            <div id="modalPremiumReasonBox" style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; color:#991b1b; padding:12px 16px; border-radius:8px; font-size:0.84rem; margin-bottom:18px; line-height:1.4; font-weight:600;">
              <!-- Motivo inyectado dinámicamente -->
            </div>

            <h4 style="margin:0 0 12px 0; font-size:0.92rem; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.04em;">
              Comparativa de Beneficios:
            </h4>

            <div style="border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; margin-bottom:20px; font-size:0.83rem;">
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; background:#f8fafc; padding:10px 14px; font-weight:800; color:#475569; border-bottom:1px solid #e2e8f0;">
                <div>Característica</div>
                <div style="text-align:center;">Plan Libre</div>
                <div style="text-align:center; color:#4338ca;">⭐ DMD IA Premium</div>
              </div>
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; padding:10px 14px; border-bottom:1px solid #f1f5f9; align-items:center;">
                <div style="font-weight:700; color:#1e293b;">Generación de Ideas con IA</div>
                <div style="text-align:center; color:#ef4444; font-weight:700;">3 ideas máx</div>
                <div style="text-align:center; color:#16a34a; font-weight:800;">✨ ILIMITADAS</div>
              </div>
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; padding:10px 14px; border-bottom:1px solid #f1f5f9; align-items:center; background:#fafafa;">
                <div style="font-weight:700; color:#1e293b;">Rediseño asistido por IA</div>
                <div style="text-align:center; color:#64748b;">Bloqueado</div>
                <div style="text-align:center; color:#16a34a; font-weight:800;">✔ Sin restricciones</div>
              </div>
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; padding:10px 14px; border-bottom:1px solid #f1f5f9; align-items:center;">
                <div style="font-weight:700; color:#1e293b;">Acceso a Plantillas Exclusivas</div>
                <div style="text-align:center; color:#64748b;">Solo básicas</div>
                <div style="text-align:center; color:#16a34a; font-weight:800;">👑 +60 Plantillas VIP</div>
              </div>
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; padding:10px 14px; border-bottom:1px solid #f1f5f9; align-items:center; background:#fafafa;">
                <div style="font-weight:700; color:#1e293b;">Formatos de Descarga</div>
                <div style="text-align:center; color:#64748b;">Estándar</div>
                <div style="text-align:center; color:#16a34a; font-weight:800;">PNG 4K, SVG &amp; HTML</div>
              </div>
              <div style="display:grid; grid-template-columns:1.8fr 1fr 1.2fr; padding:10px 14px; align-items:center;">
                <div style="font-weight:700; color:#1e293b;">Historial en Portal Cliente &amp; Admin</div>
                <div style="text-align:center; color:#16a34a;">✔ Sincronizado</div>
                <div style="text-align:center; color:#16a34a; font-weight:800;">⭐ Prioritario Cloud</div>
              </div>
            </div>

            <!-- PASARELA MULTIMÉTODO: STRIPE, MERCADO PAGO, SPEI, OXXO, PAYPAL -->
            <h4 style="margin:0 0 10px 0; font-size:0.92rem; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:0.04em;">Selecciona tu Método de Pago Seguro:</h4>
            <div style="display:flex; gap:6px; margin-bottom:14px; overflow-x:auto; padding-bottom:4px;" id="dmdPayTabButtons">
              <button type="button" onclick="window.switchDmdPayTab('card')" id="dmdPayTabBtn_card" style="flex:1; min-width:85px; padding:8px 4px; border-radius:10px; border:1.5px solid #2563eb; background:#eff6ff; color:#1e40af; font-size:0.75rem; font-weight:800; cursor:pointer;">💳 Tarjeta</button>
              <button type="button" onclick="window.switchDmdPayTab('mp')" id="dmdPayTabBtn_mp" style="flex:1; min-width:85px; padding:8px 4px; border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-size:0.75rem; font-weight:700; cursor:pointer;">📱 Mercado Pago</button>
              <button type="button" onclick="window.switchDmdPayTab('spei')" id="dmdPayTabBtn_spei" style="flex:1; min-width:80px; padding:8px 4px; border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-size:0.75rem; font-weight:700; cursor:pointer;">🏦 SPEI</button>
              <button type="button" onclick="window.switchDmdPayTab('oxxo')" id="dmdPayTabBtn_oxxo" style="flex:1; min-width:75px; padding:8px 4px; border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-size:0.75rem; font-weight:700; cursor:pointer;">🏪 OXXO</button>
              <button type="button" onclick="window.switchDmdPayTab('paypal')" id="dmdPayTabBtn_paypal" style="flex:1; min-width:75px; padding:8px 4px; border-radius:10px; border:1px solid #cbd5e1; background:#ffffff; color:#334155; font-size:0.75rem; font-weight:700; cursor:pointer;">🅿️ PayPal</button>
            </div>
            <div id="dmdPayPanel_card" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:10px;"><span style="font-size:0.8rem; font-weight:800; color:#0f172a;">Pago con Tarjeta Cifrada</span><span style="font-size:0.72rem; color:#059669; font-weight:700;">🔒 SSL 256-bit</span></div>
              <input type="text" id="dmdCardNumber" placeholder="4152 •••• •••• ••••" maxlength="19" style="width:100%; height:38px; border:1.5px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:0.86rem; font-family:monospace; box-sizing:border-box; margin-bottom:8px;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                <input type="text" id="dmdCardExp" placeholder="MM/AA" maxlength="5" style="height:38px; border:1.5px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:0.86rem; box-sizing:border-box;">
                <input type="password" id="dmdCardCvv" placeholder="CVV" maxlength="4" style="height:38px; border:1.5px solid #cbd5e1; border-radius:8px; padding:0 12px; font-size:0.86rem; box-sizing:border-box;">
              </div>
              <button type="button" class="btn btn-primary" onclick="window.processCardPayment()" style="width:100%; height:42px; justify-content:center; font-size:0.9rem; font-weight:800; background:linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); border:none; border-radius:10px; cursor:pointer;">💳 Pagar $79 MXN y Activar ➔</button>
            </div>
            <div id="dmdPayPanel_mp" style="display:none; background:#f0f9ff; border:1px solid #bae6fd; border-radius:12px; padding:14px; margin-bottom:14px; text-align:center;">
              <div style="font-size:0.88rem; font-weight:800; color:#0369a1; margin-bottom:4px;">Mercado Pago Checkout & QR</div>
              <p style="font-size:0.76rem; color:#475569; margin:0 0 10px 0;">Paga con saldo de Mercado Pago o tarjeta asociada.</p>
              <button type="button" onclick="window.processMercadoPagoPayment()" style="width:100%; height:40px; border:none; border-radius:8px; background:#009ee3; color:#fff; font-weight:800; font-size:0.9rem; cursor:pointer;">⚡ Pagar $79 MXN con Mercado Pago ➔</button>
            </div>
            <div id="dmdPayPanel_spei" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:14px; margin-bottom:14px;">
              <div style="font-size:0.82rem; font-weight:800; color:#0f172a; margin-bottom:6px;">Transferencia SPEI (Sin comisiones):</div>
              <div style="font-size:0.78rem; line-height:1.4; background:#fff; padding:8px; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:10px;">CLABE: <strong style="color:#1e40af;">646180123456789012</strong><br>Banco: BBVA / STP · Titular: DMD Tech ($79.00 MXN)</div>
              <button type="button" class="btn btn-primary" onclick="window.activatePremiumSubscription('SPEI')" style="width:100%; height:38px; justify-content:center; font-size:0.82rem; font-weight:800; background:#059669; border:none;">✔ Confirmar Transferencia ($79 MXN)</button>
            </div>
            <div id="dmdPayPanel_oxxo" style="display:none; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px; margin-bottom:14px; text-align:center;">
              <div style="font-size:0.84rem; font-weight:800; color:#92400e; margin-bottom:4px;">Referencia OXXO Pay de 14 Dígitos:</div>
              <div style="font-family:monospace; font-size:1.1rem; font-weight:900; color:#b45309; letter-spacing:2px; margin-bottom:10px;">9340-2026-7891-23</div>
              <button type="button" class="btn btn-primary" onclick="window.activatePremiumSubscription('OXXO')" style="width:100%; height:38px; justify-content:center; font-size:0.82rem; font-weight:800; background:#d97706; border:none;">✔ Activar con Ticket OXXO</button>
            </div>
            <div id="dmdPayPanel_paypal" style="display:none; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; margin-bottom:14px; text-align:center;">
              <button type="button" onclick="window.processPayPalPayment()" style="width:100%; height:42px; border:none; border-radius:8px; background:#ffc439; color:#003087; font-weight:900; font-size:0.92rem; cursor:pointer;">🅿️ Pagar $79 MXN con PayPal ➔</button>
            </div>
                  Seguir con Plan Libre
                </button>
              </div>
            </div>
            
            <p style="text-align:center; font-size:0.75rem; color:#64748b; margin-top:14px; margin-bottom:0;">
              🔒 Pago seguro. Sin contratos forzosos. Cancela en cualquier momento con un clic.
            </p>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const reasonBox = document.getElementById("modalPremiumReasonBox");
    if (reasonBox) {
      if (reasonText) {
        reasonBox.innerHTML = `⚠️ <strong>Límite de Plan Gratuito:</strong> ${reasonText}`;
        reasonBox.style.display = "block";
      } else {
        reasonBox.innerHTML = `✨ <strong>Desbloquea todo el potencial de la Inteligencia Artificial de DMD.</strong> Ideas ilimitadas, rediseños sin esperas y plantillas VIP por un costo simbólico de solo $79 MXN/mes.`;
        reasonBox.style.display = "block";
      }
    }

    modal.style.display = "flex";
  };

  window.closePremiumSubscriptionModal = function () {
    const modal = document.getElementById("modalDmdIaPremium");
    if (modal) modal.style.display = "none";
  };

  // Barra de estado de suscripción en páginas con herramientas de IA
  window.updateSubscriptionUI = function () {
    const sub = window.getDmdSubscription();
    const bannerContainer = document.getElementById("dmdIaSubscriptionBanner");

    if (bannerContainer) {
      if (sub.isPremium) {
        bannerContainer.innerHTML = `
          <div style="background:linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border:1px solid #6366f1; border-radius:10px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; color:#ffffff; font-size:0.82rem; box-shadow:0 4px 14px rgba(99,102,241,0.2);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#f59e0b; color:#78350f; font-weight:900; font-size:0.7rem; padding:2px 8px; border-radius:4px;">PRO</span>
              <strong>⭐ Suscripción DMD IA Premium ACTIVA ($79 MXN/mes)</strong>
              <span style="color:#a5b4fc;">● Tienes ideas ilimitadas, rediseño libre y todas las plantillas VIP desbloqueadas.</span>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button type="button" class="btn btn-secondary" onclick="window.cancelPremiumSubscription()" style="padding:4px 8px; font-size:0.72rem; color:#cbd5e1; border-color:rgba(255,255,255,0.2);">
                Gestionar Plan
              </button>
            </div>
          </div>
        `;
      } else {
        const left = typeof sub.freeGenerationsLeft === "number" ? sub.freeGenerationsLeft : sub.maxFree;
        bannerContainer.innerHTML = `
          <div style="background:#f8fafc; border:1px solid #cbd5e1; border-left:4px solid #6366f1; border-radius:10px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; font-size:0.82rem; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="background:#e0e7ff; color:#4338ca; font-weight:800; font-size:0.72rem; padding:2px 8px; border-radius:4px;">PLAN LIBRE</span>
              <span style="color:#1e293b; font-weight:700;">
                Te quedan <strong style="color:${left > 0 ? '#16a34a' : '#dc2626'}; font-size:0.95rem;">${left} de ${sub.maxFree}</strong> ideas gratuitas con IA.
              </span>
              <span style="color:#64748b; font-size:0.78rem;">Rediseño y plantillas VIP limitados.</span>
            </div>
            <button type="button" class="btn btn-primary" onclick="window.openPremiumSubscriptionModal('Desbloquea ideas ilimitadas y plantillas VIP por menos de 100 pesos.')" style="padding:5px 12px; font-size:0.76rem; background:linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); border:none; box-shadow:0 4px 10px rgba(79,70,229,0.25);">
              ⭐ Desbloquear DMD IA Premium ($79 MXN/mes) ➔
            </button>
          </div>
        `;
      }
    }
  };

  // Inicialización automática si existen elementos en la página activa
  document.addEventListener("DOMContentLoaded", function () {
    window.updateSubscriptionUI();
    if (document.getElementById("clientAiCreationsTableBody") || document.getElementById("clientAiCreationsGrid")) {
      window.renderClientAiCreations();
    }
    if (document.getElementById("adminAiLogsTableBody")) {
      window.adminRenderAiLogsTable();
    }
  });

  // BUG-03: Alias global window.upgradeToPremium para compatibilidad con posts.html, publicidad.html y accesos directos
  window.upgradeToPremium = function (reasonText = "") {
    // Si el modal local de posts o publicidad está abierto, ocultarlo para evitar solapamiento
    if (typeof window.closePremiumModal === "function") {
      window.closePremiumModal();
    }
    const legacyModal = document.getElementById("premiumUpgradeModal");
    if (legacyModal) {
      legacyModal.classList.add("hidden");
      legacyModal.classList.remove("flex", "active");
      legacyModal.style.setProperty("display", "none", "important");
    }

    if (typeof window.openPremiumSubscriptionModal === "function") {
      return window.openPremiumSubscriptionModal(reasonText || "Desbloquea todo el catálogo y descargas ilimitadas por solo $79 MXN/mes.");
    } else if (typeof window.openPremiumModal === "function") {
      return window.openPremiumModal('plans');
    }
  };

  // Asignación directa de respaldo
  if (!window.upgradeToPremium) {
    window.upgradeToPremium = window.openPremiumSubscriptionModal || window.openPremiumModal;
  }

})();
