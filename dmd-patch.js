/* DMD Login (proyecto aparte) — parche de enlaces.
   El CSS y el JS compartidos se cargan desde el sitio oficial
   (https://www.dmdmx.dev/style.css y /script.js), porque son archivos
   de 172 KB y 244 KB que no se pueden subir por partes sin romperlos.
   El script oficial construye el menú móvil (drawer) y la barra inferior
   con enlaces relativos a las páginas del sitio oficial; en este dominio
   esas páginas no existen, así que este parche los reescribe a su URL
   absoluta en www.dmdmx.dev. Los enlaces a login/portal/admin se
   dejan relativos: esas páginas sí viven en este proyecto. */
(function () {
  var OFFICIAL = "https://www.dmdmx.dev";
  var LOCAL_PAGES = ["login.html", "portal.html", "admin.html"];
  function patchLinks() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute("data-dmd-patched")) continue;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#" || href.indexOf(":") !== -1 || href.indexOf("//") === 0) {
        a.setAttribute("data-dmd-patched", "1");
        continue;
      }
      var page = href.split("?")[0].split("#")[0];
      if (page.slice(-5) === ".html" && LOCAL_PAGES.indexOf(page) === -1) {
        a.setAttribute("href", OFFICIAL + "/" + href);
      }
      a.setAttribute("data-dmd-patched", "1");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      patchLinks();
      setTimeout(patchLinks, 600);
    });
  } else {
    patchLinks();
    setTimeout(patchLinks, 600);
  }
})();
