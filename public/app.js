import React, { useEffect, useMemo, useRef, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";
import Chart from "https://esm.sh/chart.js@4.5.0/auto";
import {
  BarChart3,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Disc3,
  Eye,
  Flag,
  Headphones,
  Image,
  Library,
  Lock,
  LogOut,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Newspaper,
  Phone,
  Plus,
  Reply,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Users
} from "https://esm.sh/lucide-react@0.468.0?deps=react@18.3.1";

const h = React.createElement;

function SafeImage({ src, className, fallbackClassName, fallbackIcon, alt = "" }) {
  const [failedSrc, setFailedSrc] = useState("");
  const safeSrc = String(src || "").trim();
  if (!safeSrc || failedSrc === safeSrc) {
    return h("div", { className: fallbackClassName || className }, fallbackIcon || h(Image, { size: 28 }));
  }
  return h("img", { className, src: safeSrc, alt, loading: "lazy", onError: () => setFailedSrc(safeSrc) });
}

function UserAvatar({ user, className = "bubble-comment-avatar", onOpenProfile }) {
  const name = user?.authorName || user?.name || "Usuario";
  const avatar = h(SafeImage, {
    src: user?.authorAvatarUrl || user?.avatarUrl || "",
    className,
    fallbackClassName: `${className} avatar-fallback`,
    fallbackIcon: (name || "U").slice(0, 1).toUpperCase(),
    alt: `Foto de ${name}`
  });
  if (!onOpenProfile || !user?.userId) return avatar;
  return h("button", {
    className: "user-profile-avatar-link",
    type: "button",
    onClick: () => onOpenProfile(user.userId),
    title: `Abrir perfil de ${name}`
  }, avatar);
}

function UserProfileName({ user, onOpenProfile }) {
  const name = user?.authorName || user?.name || "Usuario";
  if (!onOpenProfile || !user?.userId) return h("strong", null, name);
  return h("button", {
    className: "user-profile-name-link",
    type: "button",
    onClick: () => onOpenProfile(user.userId)
  }, name);
}

function getStoredTheme() {
  try {
    return localStorage.getItem("myalbuns-theme") || "light";
  } catch {
    return "light";
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem("myalbuns-theme", theme);
  } catch {
    // O modo visual continua funcionando mesmo se o navegador bloquear armazenamento.
  }
}

const modalEscapeStack = [];

function useEscapeToClose(onClose) {
  const tokenRef = useRef(Symbol("modal"));

  useEffect(() => {
    const token = tokenRef.current;
    modalEscapeStack.push(token);

    function handleKeyDown(event) {
      if (event.key === "Escape" && modalEscapeStack[modalEscapeStack.length - 1] === token) {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      const index = modalEscapeStack.lastIndexOf(token);
      if (index !== -1) {
        modalEscapeStack.splice(index, 1);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
}

const listLabels = {
  genres: "Gêneros",
  formats: "Formatos",
  platforms: "Plataformas",
  listeningTypes: "Tipo de audição",
  moods: "Humor",
  locations: "Local",
  companies: "Companhia",
  yesNo: "Sim/Não"
};

const views = [
  { id: "catalogo", label: "Cadastro Catálogo", icon: Library },
  { id: "registro", label: "Registrar Audição", icon: Headphones },
  { id: "diario", label: "Diário", icon: Calendar },
  { id: "news", label: "Comunidade", icon: Newspaper },
  { id: "bubbles", label: "Bubbles - Fórum", icon: Users },
  { id: "perfil", label: "Perfil", icon: Users },
  { id: "dashboards", label: "Minhas Estatísticas", icon: BarChart3 },
  { id: "usuarios", label: "Usuários", icon: Users, adminOnly: true },
  { id: "configuracoes", label: "Configurações", icon: Settings, adminOnly: true }
];

function App() {
  const [db, setDb] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("catalogo");
  const [spotifyConfigured, setSpotifyConfigured] = useState(false);
  const [toast, setToast] = useState("");
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [theme, setTheme] = useState(getStoredTheme);
  const [floatingPodcast, setFloatingPodcast] = useState(null);
  const [podcastPlayback, setPodcastPlayback] = useState(null);
  const [profileUserId, setProfileUserId] = useState("");
  const [initialBubbleId, setInitialBubbleId] = useState("");
  const visibleViews = views.filter((item) => !item.adminOnly || user?.role === "admin");
  const activeView = visibleViews.find((item) => item.id === view) || visibleViews[0];

  async function loadAll() {
    const nextDb = await api("/api/db");
    const spotify = await api("/api/spotify/status").catch(() => ({ configured: false }));
    setDb(nextDb);
    setSpotifyConfigured(Boolean(spotify.configured));
  }

  useEffect(() => {
    bootstrapAuth();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storeTheme(theme);
  }, [theme]);

  async function bootstrapAuth() {
    setAuthLoading(true);
    try {
      const auth = await api("/api/auth/me");
      setUser(auth.user);
      await loadAll();
    } catch {
      setUser(null);
      setDb(null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(credentials) {
    const auth = await api("/api/auth/login", { method: "POST", body: credentials });
    setUser(auth.user);
    await loadAll();
  }

  async function handleLogout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setDb(null);
    setToast("");
  }

  if (authLoading) {
    return h("div", { className: "boot" },
      h(Loader2, { className: "spin", size: 28 }),
      h("strong", null, "Carregando sistema")
    );
  }

  if (!user) {
    return h(PublicVisitorApp, { onLogin: handleLogin, theme, setTheme });
  }

  if (!db) {
    return h("div", { className: "boot" },
      h(Loader2, { className: "spin", size: 28 }),
      h("strong", null, "Carregando dados")
    );
  }

  function navigate(nextView) {
    const target = visibleViews.find((item) => item.id === nextView);
    if (!target) return;
    if (nextView !== "news") promotePodcastToFloating();
    if (nextView === "registro") setSelectedCatalogId("");
    if (nextView === "perfil") setProfileUserId("");
    setView(nextView);
  }

  function openPublicProfile(userId = "") {
    setProfileUserId(userId && userId !== user?.id ? userId : "");
    setView("perfil");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openBubble(bubbleId = "") {
    setInitialBubbleId(bubbleId);
    setView("bubbles");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function promotePodcastToFloating() {
    if (floatingPodcast?.playbackAudioUrl) return;
    if (!podcastPlayback?.isPlaying || !podcastPlayback.episode?.playbackAudioUrl) return;
    setFloatingPodcast({
      ...podcastPlayback.episode,
      resumeTime: podcastPlayback.currentTime || 0
    });
  }

  return h(React.Fragment, null,
    h("div", { className: "shell" },
    h(Sidebar, { view: activeView.id, views: visibleViews, setView: navigate, spotifyConfigured, theme, setTheme, user, onLogout: handleLogout }),
    h("main", { className: "workspace" },
      h("header", { className: "topbar" },
        h("div", null,
          h("h1", null, activeView.label)
        ),
        h("div", { className: "top-actions" },
          activeView.id === "news" && user?.role === "admin"
            ? h("button", { className: "ghost-btn", onClick: () => window.dispatchEvent(new Event("myalbuns-refresh-news")) }, h(RefreshCw, { size: 17 }), "Atualizar News")
            : null,
          h("button", { className: "primary-btn", onClick: () => navigate("registro") }, h(Plus, { size: 17 }), "Nova audição")
        )
      ),
      toast ? h("div", { className: "toast" }, toast) : null,
      activeView.id === "catalogo" && h(CatalogView, {
        db,
        reload: loadAll,
        notify: setToast,
        openRegister: (id) => {
          setSelectedCatalogId(id);
          setView("registro");
        }
      }),
      activeView.id === "registro" && h(RegisterView, { db, reload: loadAll, notify: setToast, selectedCatalogId }),
      activeView.id === "diario" && h(DiaryView, { db }),
      activeView.id === "news" && h(NewsView, {
        reload: loadAll,
        notify: setToast,
        user,
        openPublicProfile,
        onPodcastPlaybackChange: (state) => {
          setPodcastPlayback(state);
          if (state?.isPlaying) setFloatingPodcast(null);
        },
        onPromotePodcast: promotePodcastToFloating
      }),
      activeView.id === "bubbles" && h(BubblesView, { user, notify: setToast, openPublicProfile, initialBubbleId }),
      activeView.id === "perfil" && h(ProfileView, { user, db, setUser, notify: setToast, profileUserId, openPublicProfile, openBubble, onPodcastPlaybackChange: (state) => {
        setPodcastPlayback(state);
        if (state?.isPlaying) setFloatingPodcast(null);
      } }),
      activeView.id === "dashboards" && h(DashboardView, { db, theme }),
      activeView.id === "usuarios" && h(AdminUsersView, { notify: setToast, currentUser: user }),
      activeView.id === "configuracoes" && h(SettingsView, { db, reload: loadAll, notify: setToast })
    )
    ),
    floatingPodcast ? h(FloatingPodcastPlayer, { episode: floatingPodcast, onClose: () => { setFloatingPodcast(null); setPodcastPlayback(null); } }) : null
  );
}

function PublicVisitorApp({ onLogin, theme, setTheme }) {
  const [view, setView] = useState("news");
  const [toast, setToast] = useState("");
  const [authMode, setAuthMode] = useState("");
  const publicViews = [
    { id: "news", label: "Comunidade", icon: Newspaper },
    { id: "bubbles", label: "Bubbles - Fórum", icon: Users }
  ];
  const activeView = publicViews.find((item) => item.id === view) || publicViews[0];

  async function handleRegistered(message) {
    setAuthMode("");
    setToast(message || "Cadastro enviado para aprovacao do administrador.");
  }

  return h(React.Fragment, null,
    h("div", { className: "shell public-shell" },
      h("aside", { className: "sidebar" },
        h("div", { className: "brand" },
          h("div", { className: "brand-mark" },
            h("img", { src: "/assets/myalbuns-logo-icon.png", alt: "MyAlbums", className: "brand-logo" })
          ),
          h("div", null, h("strong", null, "MyAlbums"), h("span", null, "For Music Lovers"))
        ),
        h("nav", { className: "nav-list", "aria-label": "Areas publicas" },
          publicViews.map((item) => h("button", {
            key: item.id,
            className: `nav-item ${activeView.id === item.id ? "active" : ""}`,
            onClick: () => setView(item.id)
          }, h(item.icon, { size: 18 }), h("span", null, item.label), h(ChevronRight, { size: 16, className: "nav-arrow" })))
        ),
        h("div", { className: "sidebar-footer" },
          h("div", { className: "display-mode-row" },
            h("span", null, "Modo de Exibição:"),
            h(ThemeToggle, { theme, setTheme, compact: true })
          ),
          h("div", { className: "footer-divider" }),
          h("div", { className: "public-access-note" },
            h("strong", null, "Visitante"),
            h("span", null, "Conteudos publicos liberados.")
          ),
          h("button", { className: "logout-btn", type: "button", onClick: () => setAuthMode("login") }, h(LogOut, { size: 15 }), "Entrar"),
          h("button", { className: "ghost-btn public-signup-btn", type: "button", onClick: () => setAuthMode("signup") }, h(Users, { size: 15 }), "Criar conta")
        )
      ),
      h("main", { className: "workspace" },
        h("header", { className: "topbar" },
          h("div", null, h("h1", null, activeView.label)),
          h("div", { className: "top-actions" },
            h("button", { className: "ghost-btn", type: "button", onClick: () => setAuthMode("login") }, "Entrar"),
            h("button", { className: "primary-btn", type: "button", onClick: () => setAuthMode("signup") }, h(Plus, { size: 17 }), "Criar conta")
          )
        ),
        toast ? h("div", { className: "toast" }, toast) : null,
        activeView.id === "news" ? h(NewsView, { notify: setToast, user: null }) : null,
        activeView.id === "bubbles" ? h(BubblesView, { user: null, notify: setToast, openPublicProfile: () => setAuthMode("signup"), initialBubbleId: "" }) : null
      )
    ),
    authMode === "login" ? h(LoginModal, { onClose: () => setAuthMode(""), onLogin }) : null,
    authMode === "signup" ? h(SignupModal, { onClose: () => setAuthMode(""), onRegistered: handleRegistered }) : null
  );
}

function LoginView({ onLogin, theme, setTheme }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await onLogin({ email, password });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return h("main", { className: "login-page" },
    h("section", { className: "login-card" },
      h("div", { className: "login-brand" },
        h("div", { className: "login-logo" },
          h("img", { src: "/assets/myalbuns-logo-icon.png", alt: "MyAlbums", className: "brand-logo" })
        ),
        h("div", null,
          h("strong", null, "MyAlbums"),
          h("span", null, "For Music Lovers")
        )
      ),
      h("form", { className: "login-form", onSubmit: submit, autoComplete: "off" },
        h("label", null,
          h("span", null, h(Mail, { size: 15 }), "Email"),
          h("input", {
            type: "email",
            value: email,
            autoComplete: "off",
            name: "myalbuns-login-email",
            onChange: (event) => setEmail(event.target.value),
            required: true
          })
        ),
        h("label", null,
          h("span", null, h(Lock, { size: 15 }), "Senha"),
          h("input", {
            type: "password",
            value: password,
            autoComplete: "new-password",
            name: "myalbuns-login-password",
            onChange: (event) => setPassword(event.target.value),
            required: true
          })
        ),
        message ? h("div", { className: "login-message" }, message) : null,
        h("button", { className: "primary-btn", disabled: loading },
          loading ? h(Loader2, { className: "spin", size: 17 }) : h(Check, { size: 17 }),
          loading ? "Entrando" : "Entrar"
        )
      )
    )
  );
}

function LoginModal({ onClose, onLogin }) {
  useEscapeToClose(onClose);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      await onLogin({ email, password });
      onClose();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal auth-modal", role: "dialog", "aria-modal": "true", "aria-label": "Entrar no MyAlbums", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "modal-head" },
        h("div", null, h("p", null, "Acesso"), h("h2", null, "Entrar")),
        h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
      ),
      h("form", { className: "login-form", onSubmit: submit, autoComplete: "off" },
        h("label", null,
          h("span", null, h(Mail, { size: 15 }), "Email"),
          h("input", { type: "email", value: email, autoComplete: "off", onChange: (event) => setEmail(event.target.value), required: true })
        ),
        h("label", null,
          h("span", null, h(Lock, { size: 15 }), "Senha"),
          h("input", { type: "password", value: password, autoComplete: "new-password", onChange: (event) => setPassword(event.target.value), required: true })
        ),
        message ? h("div", { className: "login-message" }, message) : null,
        h("button", { className: "primary-btn", disabled: loading },
          loading ? h(Loader2, { className: "spin", size: 17 }) : h(Check, { size: 17 }),
          loading ? "Entrando" : "Entrar"
        )
      )
    )
  );
}

function SignupModal({ onClose, onRegistered }) {
  useEscapeToClose(onClose);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "", phone: "", whatsapp: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const data = await api("/api/auth/register", { method: "POST", body: form });
      onRegistered(data.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal auth-modal signup-modal", role: "dialog", "aria-modal": "true", "aria-label": "Criar conta no MyAlbums", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "modal-head" },
        h("div", null, h("p", null, "Comunidade"), h("h2", null, "Criar conta")),
        h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
      ),
      h("div", { className: "signup-approval-note" },
        "Seu cadastro precisa ser aprovado por um Administrador, sendo assim, após o cadastro, aguarde a confirmação para que possa utilizar a plataforma."
      ),
      h("form", { className: "form-grid", onSubmit: submit, autoComplete: "off" },
        h(AdminInput, { label: "Nome", value: form.name, onChange: (value) => updateField("name", value), required: true }),
        h(AdminInput, { label: "Email", type: "email", value: form.email, onChange: (value) => updateField("email", value), required: true }),
        h(AdminInput, { label: "Senha", type: "password", value: form.password, onChange: (value) => updateField("password", value), required: true }),
        h(AdminInput, { label: "Confirmar senha", type: "password", value: form.confirmPassword, onChange: (value) => updateField("confirmPassword", value), required: true }),
        h(AdminInput, { label: "Celular", value: form.phone, onChange: (value) => updateField("phone", value), icon: Phone }),
        h(AdminInput, { label: "WhatsApp", value: form.whatsapp, onChange: (value) => updateField("whatsapp", value), icon: Phone }),
        message ? h("div", { className: "login-message full" }, message) : null,
        h("div", { className: "form-actions full" },
          h("button", { className: "primary-btn", disabled: loading },
            loading ? h(Loader2, { className: "spin", size: 16 }) : h(Check, { size: 16 }),
            loading ? "Enviando" : "Enviar cadastro"
          )
        )
      )
    )
  );
}

function ThemeToggle({ theme, setTheme, compact = false }) {
  const isDark = theme === "dark";
  return h("button", {
    className: `theme-toggle ${compact ? "compact" : ""} ${isDark ? "dark" : "light"}`,
    type: "button",
    onClick: () => setTheme(isDark ? "light" : "dark"),
    "aria-label": isDark ? "Mudar para modo claro" : "Mudar para modo escuro",
    title: isDark ? "Modo escuro ativo" : "Modo claro ativo"
  },
    h("span", { className: "theme-thumb" },
      h("img", { src: isDark ? "/assets/light-mode.png" : "/assets/dark-mode.png", alt: "" })
    )
  );
}

function Sidebar({ view, views, setView, spotifyConfigured, theme, setTheme, user, onLogout }) {
  return h("aside", { className: "sidebar" },
    h("div", { className: "brand" },
      h("div", { className: "brand-mark" },
        h("img", { src: "/assets/myalbuns-logo-icon.png", alt: "MyAlbums", className: "brand-logo" })
      ),
      h("div", null, h("strong", null, "MyAlbums"), h("span", null, "For Music Lovers"))
    ),
    h("nav", { className: "nav-list", "aria-label": "Abas do sistema" },
      views.map((item) => h("button", {
        key: item.id,
        className: `nav-item ${view === item.id ? "active" : ""}`,
        onClick: () => setView(item.id)
      }, h(item.icon, { size: 18 }), h("span", null, item.label), h(ChevronRight, { size: 16, className: "nav-arrow" })))
    ),
    h("div", { className: "sidebar-footer" },
      h("div", { className: "display-mode-row" },
        h("span", null, "Modo de Exibição:"),
        h(ThemeToggle, { theme, setTheme, compact: true })
      ),
      h("div", { className: "footer-divider" }),
      h("div", { className: "user-mini" },
        h("strong", null, user?.name || "Usuário"),
        h("span", null, user?.role === "admin" ? "(ADMIN)" : "(USER)")
      ),
      h("button", { className: "logout-btn", type: "button", onClick: onLogout },
        h(LogOut, { size: 15 }),
        "Sair"
      ),
      h("div", { className: `spotify-mini ${spotifyConfigured ? "ok" : ""}` },
        h(Sparkles, { size: 14 }),
        h("span", null, spotifyConfigured ? "Spotify On" : "Spotify Off")
      )
    )
  );
}

function CatalogView({ db, reload, notify, openRegister }) {
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [results, setResults] = useState([]);
  const [manualOpen, setManualOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function searchSpotify(event) {
    event?.preventDefault();
    if (!artist.trim() && !album.trim()) {
      notify("Preencha artista, álbum ou os dois campos.");
      return;
    }
    setLoading(true);
    setResults([]);
    try {
      const params = new URLSearchParams({ artist, album });
      const data = await api(`/api/spotify/search?${params.toString()}`);
      setResults(data.results || []);
      notify(data.results?.length ? "" : "Nenhum álbum encontrado.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function importAlbum(item) {
    await api("/api/catalog", { method: "POST", body: item });
    notify("Álbum importado para o catálogo.");
    setResults([]);
    await reload();
  }

  async function deleteAlbum(id) {
    await api(`/api/catalog/${encodeURIComponent(id)}`, { method: "DELETE" });
    notify("Álbum removido do catálogo.");
    await reload();
  }

  return h("div", { className: "screen-grid" },
    h("section", { className: "panel hero-panel" },
      h("div", { className: "panel-title" },
        h("div", null, h("p", null, "Spotify Web API"), h("h2", null, "Buscar e importar álbuns")),
        h(Search, { size: 22 })
      ),
      h("form", { className: "spotify-form", onSubmit: searchSpotify },
        h(Field, { label: "Artista" }, h("input", { value: artist, onChange: (e) => setArtist(e.target.value), placeholder: "Ex.: The Beatles" })),
        h(Field, { label: "Álbum" }, h("input", { value: album, onChange: (e) => setAlbum(e.target.value), placeholder: "Ex.: Rubber Soul" })),
        h("button", { className: "primary-btn tall", disabled: loading, type: "submit" }, loading ? h(Loader2, { className: "spin", size: 17 }) : h(Search, { size: 17 }), "Buscar")
      ),
      results.length ? h("div", { className: "result-grid" }, results.map((item) => h(AlbumCard, { key: item.id, album: item, mode: "import", onImport: importAlbum }))) : null
    ),
    h("section", { className: "panel" },
      h("div", { className: "panel-title" },
        h("div", null, h("p", null, "Base local"), h("h2", null, "Catálogo de álbuns")),
        h("button", { className: "ghost-btn", onClick: () => setManualOpen(!manualOpen) }, h(Plus, { size: 16 }), "Cadastro manual")
      ),
      manualOpen ? h(ManualCatalogForm, { db, reload, notify, close: () => setManualOpen(false) }) : null,
      db.catalog.length
        ? h("div", { className: "result-grid catalog-list" }, db.catalog.map((item) => h(AlbumCard, {
            key: item.id,
            album: item,
            mode: "catalog",
            onDelete: deleteAlbum,
            onRegister: () => openRegister(item.id)
          })))
        : h(EmptyState, { text: "Nenhum álbum cadastrado ainda." })
    )
  );
}

function AlbumCard({ album, mode, onImport, onDelete, onRegister }) {
  return h("article", { className: "album-card" },
    album.coverUrl
      ? h("img", { className: "album-cover", src: album.coverUrl, alt: "" })
      : h("div", { className: "album-cover placeholder" }, h(Disc3, { size: 28 })),
    h("div", { className: "album-copy" },
      h("div", null,
        h("h3", null, album.album),
        h("p", null, `${album.artist || "Artista não informado"} · ${album.releaseYear || "s/ ano"} · ${album.tracks || 0} faixas`)
      ),
      h("div", { className: "album-actions" },
        mode === "import"
          ? h("button", { className: "primary-btn small", onClick: () => onImport(album) }, h(Plus, { size: 15 }), "Importar")
          : [
              h("button", { key: "register", className: "ghost-btn small", onClick: onRegister }, h(Headphones, { size: 15 }), "Registrar"),
              h("button", { key: "delete", className: "danger-btn small", onClick: () => onDelete(album.id) }, h(Trash2, { size: 15 }), "Excluir")
            ]
      )
    )
  );
}

function LegacyNewsView({ reload, notify }) {
  const [releases, setReleases] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState(null);
  const [cacheMessage, setCacheMessage] = useState("");

  async function loadReleases(nextCursor = cursor, refresh = false) {
    setLoading(true);
    try {
      const params = `limit=12&cursor=${encodeURIComponent(nextCursor)}`;
      const data = refresh
        ? await api(`/api/news/releases/refresh?${params}`, { method: "POST" })
        : await api(`/api/news/releases?${params}`);
      setReleases(data.results || []);
      setCursor(Number(data.nextCursor || 0));
      setCacheMessage(data.message || (data.cached ? "Exibindo lançamentos salvos no cache." : ""));
      notify(data.results?.length ? "" : "Nenhum lançamento encontrado no Spotify.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function importAlbum(item) {
    await api("/api/catalog", { method: "POST", body: item });
    notify("Lançamento importado para o catálogo.");
    await reload();
  }

  useEffect(() => {
    loadReleases(0);
  }, []);

  useEffect(() => {
    function refreshNews() {
      loadReleases(cursor, true);
    }
    window.addEventListener("myalbuns-refresh-news", refreshNews);
    return () => window.removeEventListener("myalbuns-refresh-news", refreshNews);
  }, [cursor]);

  const featured = releases[0] || null;
  const tray = releases.slice(1, 7);
  const stories = releases.slice(1);
  function viewRelease(album) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedRelease(album), 180);
  }

  return h("div", { className: "screen-grid" },
    h("section", { className: "news-hero" },
      featured
        ? h(NewsFeature, { album: featured, onImport: importAlbum, onView: viewRelease })
        : h("div", { className: "news-feature empty-feature" },
            h("p", null, "Spotify Web API"),
            h("h2", null, loading ? "Buscando lançamentos..." : "Nenhum lançamento carregado ainda")
          )
    ),
    cacheMessage ? h("div", { className: "news-cache-note" }, cacheMessage) : null,
    tray.length ? h("section", { className: "news-strip" },
      h("div", { className: "news-section-title" },
        h("span", null, "Popular na curadoria"),
        h("button", { type: "button", onClick: () => loadReleases(cursor) }, "Mais")
      ),
      h("div", { className: "release-poster-row" },
        tray.map((album) => h(ReleasePoster, { key: album.spotifyId || album.id, album, onView: viewRelease }))
      )
    ) : null,
    h("section", { className: "news-list-panel" },
      h("div", { className: "news-section-title" },
        h("span", null, "Últimos lançamentos"),
        h("button", { type: "button", disabled: loading, onClick: () => loadReleases(cursor) }, loading ? "Atualizando" : "Próxima bandeja")
      ),
      loading && !releases.length
        ? h(EmptyState, { text: "Buscando lançamentos da curadoria..." })
        : stories.length
          ? h("div", { className: "news-story-list" }, stories.map((album) => h(ReleaseStoryCard, { key: album.spotifyId || album.id, album, onView: viewRelease })))
          : h(EmptyState, { text: "Nenhum lançamento carregado ainda." })
    ),
    selectedRelease ? h(ReleaseDetailModal, { album: selectedRelease, onClose: () => setSelectedRelease(null), onImport: importAlbum }) : null
  );
}

function NewsView({ reload, notify, user, openPublicProfile, onPodcastPlaybackChange, onPromotePodcast }) {
  const [communityTab, setCommunityTab] = useState("news");
  const [newsItems, setNewsItems] = useState([]);
  const [articles, setArticles] = useState([]);
  const [podcasts, setPodcasts] = useState([]);
  const [friends, setFriends] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedNews, setSelectedNews] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingPodcast, setEditingPodcast] = useState(null);
  const [cacheMessage, setCacheMessage] = useState("");
  const isAdmin = user?.role === "admin";

  async function loadCommunityNews(nextCursor = cursor, refresh = false) {
    setLoading(true);
    try {
      const params = `limit=12&cursor=${encodeURIComponent(nextCursor)}`;
      const data = refresh
        ? await api(`/api/news/releases/refresh?${params}`, { method: "POST" })
        : await api(`/api/news/releases?${params}`);
      setNewsItems(data.results || []);
      setCursor(Number(data.nextCursor || 0));
      setCacheMessage(data.message || (data.cached ? "Exibindo noticias salvas no cache." : ""));
      notify(data.results?.length ? "" : "Nenhuma noticia carregada do TMDQA.");
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadArticles() {
    const data = await api("/api/articles");
    setArticles(data.articles || []);
  }

  async function loadPodcasts() {
    const data = await api("/api/podcasts");
    setPodcasts(data.episodes || []);
  }

  async function loadFriends() {
    const data = await api("/api/mydearfriends");
    setFriends(data.users || []);
  }

  async function toggleFriendFavorite(friend) {
    const data = await api(`/api/mydearfriends/${encodeURIComponent(friend.id)}`, {
      method: friend.isFavorite ? "DELETE" : "PUT"
    });
    setFriends(data.users || []);
    notify(friend.isFavorite ? "Amigo removido dos favoritos." : "Amigo favoritado.");
  }

  async function saveArticle(payload, id = "") {
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/articles/${encodeURIComponent(id)}` : "/api/articles";
    const data = await api(url, { method, body: payload });
    setArticles(data.articles || []);
    setEditingArticle(null);
    notify(payload.status === "published" ? "Artigo publicado." : payload.status === "archived" ? "Artigo arquivado." : "Rascunho salvo.");
  }

  async function savePodcast(payload, id = "") {
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/podcasts/${encodeURIComponent(id)}` : "/api/podcasts";
    const data = await api(url, { method, body: payload });
    setPodcasts(data.episodes || []);
    setEditingPodcast(null);
    notify(payload.status === "published" ? "Episodio publicado." : payload.status === "archived" ? "Episodio arquivado." : "Rascunho salvo.");
  }

  async function deleteArticle(article) {
    if (!window.confirm(`Excluir o artigo "${article.title}"?`)) return;
    const data = await api(`/api/articles/${encodeURIComponent(article.id)}`, { method: "DELETE" });
    setArticles(data.articles || []);
    notify("Artigo excluido.");
  }

  async function deletePodcast(episode) {
    if (!window.confirm(`Excluir o episodio "${episode.title}"?`)) return;
    const data = await api(`/api/podcasts/${encodeURIComponent(episode.id)}`, { method: "DELETE" });
    setPodcasts(data.episodes || []);
    notify("Episodio excluido.");
  }

  useEffect(() => {
    loadCommunityNews(0);
    loadArticles().catch((error) => notify(error.message));
    loadPodcasts().catch((error) => notify(error.message));
    if (user) loadFriends().catch((error) => notify(error.message));
  }, []);

  useEffect(() => {
    function refreshNews() {
      loadCommunityNews(0, true);
    }
    window.addEventListener("myalbuns-refresh-news", refreshNews);
    return () => window.removeEventListener("myalbuns-refresh-news", refreshNews);
  }, []);

  const featured = newsItems[0] || null;
  const tray = newsItems.slice(1, 7);
  const stories = newsItems.slice(1);
  const featuredArticle = articles.find((item) => item.status === "published") || articles[0] || null;
  const otherArticles = featuredArticle ? articles.filter((item) => item.id !== featuredArticle.id) : articles;
  const featuredPodcast = podcasts.find((item) => item.status === "published") || podcasts[0] || null;
  const otherPodcasts = featuredPodcast ? podcasts.filter((item) => item.id !== featuredPodcast.id) : podcasts;
  const tabs = [
    ["news", "News", "Noticias do TMDQA", Newspaper],
    ["editorial", "Editorial", "Artigos da plataforma", BookOpen],
    ["podcast", "Podcast", "Episodios dos admins", Headphones]
  ];
  if (user) tabs.push(["friends", "MyDearFriends", "Perfis da comunidade", Users]);

  function viewNews(item) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedNews(item), 180);
  }

  function viewArticle(article) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedArticle(article), 180);
  }

  function viewPodcast(episode) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedPodcast(episode), 180);
  }

  return h("div", { className: "screen-grid" },
    h("nav", { className: "community-tabs", "aria-label": "Areas da Comunidade" },
      tabs.map(([id, label, description, Icon]) =>
        h("button", {
          key: id,
          type: "button",
          className: communityTab === id ? "active" : "",
          onClick: () => {
            if (communityTab === "podcast" && id !== "podcast") onPromotePodcast?.();
            setCommunityTab(id);
          }
        },
          h("span", { className: "community-tab-icon" }, h(Icon, { size: 18 })),
          h("span", { className: "community-tab-copy" },
            h("strong", null, label),
            h("small", null, description)
          )
        )
      )
    ),
    communityTab === "news" ? h(CommunityNewsArea, { featured, tray, stories, loading, cursor, cacheMessage, loadCommunityNews, viewNews }) : null,
    communityTab === "editorial" ? h(CommunityEditorialArea, { featuredArticle, otherArticles, isAdmin, viewArticle, setEditingArticle, deleteArticle }) : null,
    communityTab === "podcast" ? h(CommunityPodcastArea, { featuredPodcast, otherPodcasts, isAdmin, viewPodcast, setEditingPodcast, deletePodcast, onPodcastPlaybackChange }) : null,
    communityTab === "friends" ? h(MyDearFriendsArea, { friends, openPublicProfile, reload: loadFriends, onToggleFavorite: toggleFriendFavorite }) : null,
    selectedNews ? h(CommunityNewsDetailModal, { item: selectedNews, onClose: () => setSelectedNews(null) }) : null,
    selectedArticle ? h(ArticleDetailModal, { article: selectedArticle, onClose: () => setSelectedArticle(null), isAdmin, openPublicProfile, canComment: Boolean(user), onEdit: (article) => { setSelectedArticle(null); setEditingArticle(article); } }) : null,
    selectedPodcast ? h(PodcastDetailModal, { episode: selectedPodcast, onClose: () => setSelectedPodcast(null), isAdmin, openPublicProfile, canComment: Boolean(user), onEdit: (episode) => { setSelectedPodcast(null); setEditingPodcast(episode); }, onPodcastPlaybackChange }) : null,
    editingArticle ? h(ArticleEditorModal, { article: editingArticle, onClose: () => setEditingArticle(null), onSave: saveArticle }) : null,
    editingPodcast ? h(PodcastEditorModal, { episode: editingPodcast, onClose: () => setEditingPodcast(null), onSave: savePodcast }) : null
  );
}

function MyDearFriendsArea({ friends, openPublicProfile, reload, onToggleFavorite }) {
  const [friendsTab, setFriendsTab] = useState("all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const favoriteCount = friends.filter((friend) => friend.isFavorite).length;
  const tabbedFriends = friendsTab === "favorites" ? friends.filter((friend) => friend.isFavorite) : friends;
  const visibleFriends = tabbedFriends.filter((friend) => {
    const haystack = [friend.name, friend.bio, friend.role].join(" ").toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  return h("section", { className: "mydearfriends-panel" },
    h("div", { className: "news-section-title" },
      h("span", null, "MyDearFriends"),
      h("button", { type: "button", onClick: reload }, "Atualizar")
    ),
    h("div", { className: "friends-tools" },
      h("div", { className: "friends-tabs", "aria-label": "Filtro de amigos" },
        h("button", { type: "button", className: friendsTab === "all" ? "active" : "", onClick: () => setFriendsTab("all") },
          h(Users, { size: 15 }),
          "Friends - Geral",
          h("em", null, friends.length)
        ),
        h("button", { type: "button", className: friendsTab === "favorites" ? "active" : "", onClick: () => setFriendsTab("favorites") },
          h(Star, { size: 15 }),
          "MyDearFriends - Favoritos",
          h("em", null, favoriteCount)
        )
      ),
      h("label", { className: "friends-search" },
        h(Search, { size: 17 }),
        h("input", {
          value: query,
          onChange: (event) => setQuery(event.target.value),
          placeholder: "Buscar perfis por nome ou bio..."
        })
      )
    ),
    visibleFriends.length
      ? h("div", { className: "mydearfriends-grid" },
          visibleFriends.map((friend) => h("article", { className: `friend-card ${friend.isFavorite ? "favorite" : ""}`, key: friend.id },
            h("button", {
              className: `friend-favorite-btn ${friend.isFavorite ? "active" : ""}`,
              type: "button",
              title: friend.isFavorite ? "Remover dos favoritos" : "Favoritar amigo",
              "aria-label": friend.isFavorite ? `Remover ${friend.name} dos favoritos` : `Favoritar ${friend.name}`,
              onClick: () => onToggleFavorite(friend)
            }, h(Star, { size: 16 })),
            h("button", { className: "friend-card-main", type: "button", onClick: () => openPublicProfile(friend.id) },
              h(UserAvatar, { user: { ...friend, userId: friend.id, authorName: friend.name }, className: "friend-card-avatar" }),
              h("div", null,
                h("strong", null, friend.name),
                h("span", null, friend.bio || "Perfil publico do MyAlbums."),
                h("div", { className: "friend-card-stats" },
                  h("em", null, `${friend.listeningCount || 0} audicoes`),
                  h("em", null, `${friend.albumCount || 0} albuns`),
                  h("em", null, `${friend.reviewCount || 0} reviews`)
                )
              )
            )
          ))
        )
      : h(EmptyState, { text: friendsTab === "favorites" ? "Nenhum amigo favorito encontrado." : "Nenhum perfil encontrado para essa busca." })
  );
}

function CommunityNewsArea({ featured, tray, stories, loading, cursor, cacheMessage, loadCommunityNews, viewNews }) {
  return h(React.Fragment, null,
    h("section", { className: "news-hero" },
      featured
        ? h(CommunityNewsFeature, { item: featured, onView: viewNews })
        : h("div", { className: "news-feature empty-feature" },
            h("p", null, "TMDQA RSS"),
            h("h2", null, loading ? "Buscando noticias..." : "Nenhuma noticia carregada ainda")
          )
    ),
    cacheMessage ? h("div", { className: "news-cache-note" }, cacheMessage) : null,
    tray.length ? h("section", { className: "news-strip" },
      h("div", { className: "news-section-title" },
        h("span", null, "Destaques do TMDQA"),
        h("button", { type: "button", onClick: () => loadCommunityNews(cursor) }, "Mais")
      ),
      h("div", { className: "release-poster-row" },
        tray.map((item) => h(CommunityNewsPoster, { key: item.id, item, onView: viewNews }))
      )
    ) : null,
    h("section", { className: "news-list-panel" },
      h("div", { className: "news-section-title" },
        h("span", null, "Ultimas noticias"),
        h("button", { type: "button", disabled: loading, onClick: () => loadCommunityNews(cursor) }, loading ? "Atualizando" : "Proxima bandeja")
      ),
      loading && !stories.length
        ? h(EmptyState, { text: "Buscando noticias do TMDQA..." })
        : stories.length
          ? h("div", { className: "news-story-list" }, stories.map((item) => h(CommunityNewsStoryCard, { key: item.id, item, onView: viewNews })))
          : h(EmptyState, { text: "Nenhuma noticia carregada ainda." })
    )
  );
}

function CommunityEditorialArea({ featuredArticle, otherArticles, isAdmin, viewArticle, setEditingArticle, deleteArticle }) {
  return h("section", { className: "newsletter-panel" },
    h("div", { className: "news-section-title" },
      h("span", null, "Editorial"),
      isAdmin ? h("button", { type: "button", onClick: () => setEditingArticle({ status: "draft" }) }, h(Plus, { size: 14 }), "Novo artigo") : null
    ),
    featuredArticle
      ? h("div", { className: "newsletter-layout" },
          h(ArticleFeature, { article: featuredArticle, isAdmin, onView: viewArticle, onEdit: setEditingArticle, onDelete: deleteArticle }),
          h("div", { className: "article-stack" },
            otherArticles.slice(0, 6).map((article) => h(ArticleMiniCard, { key: article.id, article, isAdmin, onView: viewArticle, onEdit: setEditingArticle, onDelete: deleteArticle }))
          )
        )
      : h(EmptyState, { text: isAdmin ? "Crie o primeiro artigo editorial da Comunidade." : "Nenhum artigo publicado ainda." })
  );
}

function CommunityPodcastArea({ featuredPodcast, otherPodcasts, isAdmin, viewPodcast, setEditingPodcast, deletePodcast, onPodcastPlaybackChange }) {
  return h("section", { className: "newsletter-panel podcast-panel" },
    h("div", { className: "news-section-title" },
      h("span", null, "Podcast"),
      isAdmin ? h("button", { type: "button", onClick: () => setEditingPodcast({ status: "draft" }) }, h(Plus, { size: 14 }), "Novo episodio") : null
    ),
    featuredPodcast
      ? h("div", { className: "podcast-layout" },
          h(PodcastFeature, { episode: featuredPodcast, isAdmin, onView: viewPodcast, onEdit: setEditingPodcast, onDelete: deletePodcast, onPodcastPlaybackChange }),
          h("div", { className: "podcast-stack" },
            otherPodcasts.slice(0, 20).map((episode) => h(PodcastMiniCard, { key: episode.id, episode, isAdmin, onView: viewPodcast, onEdit: setEditingPodcast, onDelete: deletePodcast }))
          )
        )
      : h(EmptyState, { text: isAdmin ? "Cadastre o primeiro episodio de Podcast da Comunidade." : "Nenhum episodio publicado ainda." })
  );
}

function ArticleFeature({ article, isAdmin, onView, onEdit, onDelete }) {
  return h("article", { className: "article-feature" },
    article.coverUrl ? h("img", { src: article.coverUrl, alt: "" }) : h("div", { className: "article-cover-fallback" }, h(BookOpen, { size: 38 })),
    h("div", { className: "article-feature-copy" },
      h("p", null, article.status === "published" ? "Artigo publicado" : article.status === "archived" ? "Arquivado" : "Rascunho"),
      h("h2", null, article.title),
      h("span", null, article.summary || "Conteudo editorial da Comunidade MyAlbums."),
      h("div", { className: "news-feature-actions" },
        h("button", { className: "ghost-btn", type: "button", onClick: () => onView(article) }, h(Eye, { size: 16 }), "Ler artigo"),
        isAdmin ? h("button", { className: "ghost-btn", type: "button", onClick: () => onEdit(article) }, h(BookOpen, { size: 16 }), "Editar") : null,
        isAdmin ? h("button", { className: "danger-btn", type: "button", onClick: () => onDelete(article) }, h(Trash2, { size: 16 }), "Excluir") : null
      )
    )
  );
}

function ArticleMiniCard({ article, isAdmin, onView, onEdit, onDelete }) {
  return h("article", { className: "article-mini-card" },
    article.coverUrl ? h("img", { src: article.coverUrl, alt: "" }) : h("div", { className: "article-mini-fallback" }, h(BookOpen, { size: 20 })),
    h("div", null,
      h("p", null, article.status === "published" ? "Publicado" : article.status === "archived" ? "Arquivado" : "Rascunho"),
      h("strong", null, article.title),
      h("span", null, article.summary || "Sem resumo informado."),
      h("div", { className: "article-mini-actions" },
        h("button", { type: "button", onClick: () => onView(article) }, h(Eye, { size: 14 }), "Ver"),
        isAdmin ? h("button", { type: "button", onClick: () => onEdit(article) }, "Editar") : null,
        isAdmin ? h("button", { type: "button", onClick: () => onDelete(article) }, "Excluir") : null
      )
    )
  );
}

function PodcastFeature({ episode, isAdmin, onView, onEdit, onDelete, onPodcastPlaybackChange }) {
  return h("article", { className: "podcast-feature" },
    h(SafeImage, { src: episode.coverUrl, fallbackClassName: "podcast-cover-fallback", fallbackIcon: h(Headphones, { size: 42 }) }),
    h("div", { className: "podcast-feature-copy" },
      h("p", null, episode.status === "published" ? "Episodio publicado" : episode.status === "archived" ? "Arquivado" : "Rascunho"),
      h("h2", null, episode.title),
      h("span", null, `${episode.authorName || "MyAlbums"} · ${episode.publishedAt ? formatDate(episode.publishedAt) : formatDate(episode.updatedAt)}${episode.durationMin ? ` · ${episode.durationMin} min` : ""}`),
      h("em", null, episode.summary || episode.description || "Episodio de Podcast da Comunidade MyAlbums."),
      episode.playbackAudioUrl ? h(PodcastInlinePlayer, { episode, onPodcastPlaybackChange }) : null,
      h("div", { className: "news-feature-actions" },
        h("button", { className: "ghost-btn", type: "button", onClick: () => onView(episode) }, h(Eye, { size: 16 }), "Ver episodio"),
        episode.externalUrl ? h("a", { className: "ghost-link", href: episode.externalUrl, target: "_blank", rel: "noreferrer" }, "Abrir episodio") : null,
        isAdmin ? h("button", { className: "ghost-btn", type: "button", onClick: () => onEdit(episode) }, h(BookOpen, { size: 16 }), "Editar") : null,
        isAdmin ? h("button", { className: "danger-btn", type: "button", onClick: () => onDelete(episode) }, h(Trash2, { size: 16 }), "Excluir") : null
      )
    )
  );
}

function PodcastMiniCard({ episode, isAdmin, onView, onEdit, onDelete }) {
  return h("article", { className: "podcast-mini-card" },
    h(SafeImage, { src: episode.coverUrl, fallbackClassName: "podcast-mini-fallback", fallbackIcon: h(Headphones, { size: 20 }) }),
    h("div", null,
      h("p", null, episode.status === "published" ? "Publicado" : episode.status === "archived" ? "Arquivado" : "Rascunho"),
      h("strong", null, episode.title),
      h("span", null, episode.summary || episode.description || "Sem resumo informado."),
      h("div", { className: "article-mini-actions" },
        h("button", { type: "button", onClick: () => onView(episode) }, h(Eye, { size: 14 }), "Ver"),
        isAdmin ? h("button", { type: "button", onClick: () => onEdit(episode) }, "Editar") : null,
        isAdmin ? h("button", { type: "button", onClick: () => onDelete(episode) }, "Excluir") : null
      )
    )
  );
}

function PodcastInlinePlayer({ episode, onPodcastPlaybackChange }) {
  function publish(event, isPlaying) {
    onPodcastPlaybackChange?.({
      episode,
      currentTime: event.currentTarget.currentTime || 0,
      isPlaying
    });
  }

  return h("audio", {
    controls: true,
    src: episode.playbackAudioUrl,
    preload: "metadata",
    onPlay: (event) => publish(event, true),
    onPause: (event) => publish(event, false),
    onEnded: (event) => publish(event, false),
    onTimeUpdate: (event) => {
      if (!event.currentTarget.paused) publish(event, true);
    }
  });
}

function FloatingPodcastPlayer({ episode, onClose }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const startAt = Number(episode.resumeTime || 0);
    const play = () => {
      if (startAt > 0 && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(startAt, Math.max(audio.duration - 1, 0));
      } else if (startAt > 0) {
        audio.currentTime = startAt;
      }
      audio.play().catch(() => null);
    };
    if (audio.readyState >= 1) play();
    else audio.addEventListener("loadedmetadata", play, { once: true });
    return () => audio.removeEventListener("loadedmetadata", play);
  }, [episode.id]);

  return h("aside", { className: "floating-podcast-player", "aria-label": "Podcast em reprodução" },
    h(SafeImage, { src: episode.coverUrl, className: "floating-podcast-cover", fallbackClassName: "floating-podcast-cover", fallbackIcon: h(Headphones, { size: 22 }) }),
    h("div", { className: "floating-podcast-copy" },
      h("span", null, "Podcast tocando"),
      h("strong", null, episode.title),
      h("small", null, episode.summary || episode.authorName || "MyAlbums")
    ),
    h("audio", {
      ref: audioRef,
      controls: true,
      src: episode.playbackAudioUrl,
      preload: "metadata"
    }),
    h("button", { className: "ghost-btn small", type: "button", onClick: onClose, title: "Fechar player" }, "Fechar")
  );
}

function BubblesView({ user, notify, openPublicProfile, initialBubbleId }) {
  const [bubbles, setBubbles] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = user?.role === "admin";

  async function loadBubbles(nextSelectedId = selectedId) {
    const data = await api("/api/bubbles");
    const list = data.bubbles || [];
    setBubbles(list);
    const targetId = list.some((bubble) => bubble.id === nextSelectedId) ? nextSelectedId : list[0]?.id || "";
    setSelectedId(targetId);
    if (targetId) await loadDetail(targetId);
    else setDetail(null);
  }

  async function loadDetail(id) {
    const data = await api(`/api/bubbles/${encodeURIComponent(id)}`);
    setDetail(data.bubble);
  }

  async function createBubble(payload) {
    const data = await api("/api/bubbles", { method: "POST", body: payload });
    setCreateOpen(false);
    notify("Bubble criada.");
    setBubbles(data.bubbles || []);
    setSelectedId(data.bubble.id);
    setDetail(data.bubble);
  }

  async function updateBubble(payload) {
    if (!detail) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}`, { method: "PUT", body: payload });
    setDetail(data.bubble);
    setBubbles(data.bubbles || bubbles);
    notify("Bubble atualizada.");
  }

  async function joinBubble() {
    if (!detail) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/join`, { method: "POST" });
    setDetail(data.bubble);
    setBubbles(data.bubbles || bubbles);
    notify("Solicitacao enviada.");
  }

  async function inviteMember(event) {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    const payload = formData(form);
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/invite`, { method: "POST", body: payload });
    form.reset();
    setDetail(data.bubble);
    setBubbles(data.bubbles || bubbles);
    notify("Usuario incluido na Bubble.");
  }

  async function createPost(event) {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    const payload = formData(form);
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/posts`, { method: "POST", body: payload });
    form.reset();
    setDetail(data.bubble);
    setBubbles((current) => current.map((bubble) => bubble.id === data.bubble.id ? { ...bubble, postCount: data.bubble.postCount } : bubble));
    notify("Publicacao enviada.");
  }

  async function createComment(event, postId, parentCommentId = "") {
    event.preventDefault();
    if (!detail) return;
    const form = event.currentTarget;
    const payload = { ...formData(form), parentCommentId };
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/posts/${encodeURIComponent(postId)}/comments`, { method: "POST", body: payload });
    form.reset();
    setDetail(data.bubble);
  }

  async function archiveBubble() {
    if (!detail || !window.confirm(`Arquivar a Bubble "${detail.name}"?`)) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/archive`, { method: "PATCH", body: {} });
    const list = data.bubbles || [];
    const nextBubble = list[0];
    setBubbles(list);
    setSelectedId(nextBubble?.id || "");
    setSettingsOpen(false);
    if (nextBubble) await loadDetail(nextBubble.id);
    else setDetail(null);
    notify("Bubble arquivada.");
  }

  async function moderateMember(member, payload) {
    if (!detail) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/members/${encodeURIComponent(member.id)}`, { method: "PATCH", body: payload });
    setDetail(data.bubble);
    setBubbles(data.bubbles || bubbles);
    notify(payload.status === "active" ? "Entrada aprovada." : payload.status === "removed" ? "Solicitacao recusada." : "Membro atualizado.");
  }

  async function moderatePost(post, status) {
    if (!detail) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/posts/${encodeURIComponent(post.id)}`, { method: "PATCH", body: { status } });
    setDetail(data.bubble);
    notify(status === "hidden" ? "Publicacao ocultada." : status === "removed" ? "Publicacao removida." : "Publicacao restaurada.");
  }

  async function moderateComment(post, comment, status) {
    if (!detail) return;
    const data = await api(`/api/bubbles/${encodeURIComponent(detail.id)}/posts/${encodeURIComponent(post.id)}/comments/${encodeURIComponent(comment.id)}`, { method: "PATCH", body: { status } });
    setDetail(data.bubble);
    notify(status === "hidden" ? "Comentario ocultado." : status === "removed" ? "Comentario removido." : "Comentario restaurado.");
  }

  useEffect(() => {
    setLoading(true);
    loadBubbles(initialBubbleId || selectedId).catch((error) => notify(error.message)).finally(() => setLoading(false));
  }, [initialBubbleId]);

  const canInteract = detail && (isAdmin || detail.myStatus === "active");
  const canManage = Boolean(detail?.canModerate || (detail && (isAdmin || (detail.myStatus === "active" && ["owner", "moderator"].includes(detail.myRole)))));
  const pendingRequests = canManage ? (detail?.members || []).filter((member) => member.status === "pending") : [];
  const hasOwnBubble = Boolean(user) && bubbles.some((bubble) => bubble.createdBy === user.id && bubble.status !== "archived");
  const canCreateBubble = Boolean(user) && !hasOwnBubble;

  return h("div", { className: "bubbles-screen" },
    h("section", { className: "bubbles-rail panel" },
      h("div", { className: "panel-title" },
        h("div", null,
          h("p", null, "Comunidades musicais"),
          h("h2", null, "Bubbles")
        ),
        canCreateBubble ? h("button", { className: "primary-btn small", type: "button", onClick: () => setCreateOpen(true) }, h(Plus, { size: 15 }), "Nova Bubble") : null
      ),
      user && !canCreateBubble ? h("div", { className: "bubble-limit-note" }, "Voce ja possui uma Bubble como owner.") : null,
      bubbles.length
        ? h("div", { className: "bubble-card-list" },
            bubbles.map((bubble) => h(BubbleCard, {
              key: bubble.id,
              bubble,
              active: bubble.id === selectedId,
              onSelect: async () => {
                setSelectedId(bubble.id);
                await loadDetail(bubble.id);
              }
            }))
          )
        : h(EmptyState, { text: loading ? "Carregando Bubbles..." : "Nenhuma Bubble visivel ainda." })
    ),
    h("section", { className: "bubble-detail panel" },
      detail
        ? h(React.Fragment, null,
            h("div", { className: "bubble-hero" },
              h("div", { className: "bubble-hero-main" },
                detail.coverUrl
                  ? h("img", { className: "bubble-hero-cover", src: detail.coverUrl, alt: "" })
                  : h("div", { className: "bubble-hero-fallback" }, detail.name.slice(0, 2).toUpperCase()),
                h("div", { className: "bubble-hero-copy" },
                  h("span", { className: `bubble-pill ${detail.visibility}` }, bubbleVisibilityLabel(detail.visibility)),
                  h("h2", null, detail.name),
                  h("p", null, detail.description || "Uma comunidade musical para conversas, recomendacoes e descobertas."),
                  h("div", { className: "bubble-owner-line" },
                    h("span", null, "Dono da Bubble"),
                    h(UserProfileName, { user: { userId: detail.createdBy, authorName: detail.creatorName || "Usuario" }, onOpenProfile: openPublicProfile })
                  ),
                  h("div", { className: "bubble-meta" },
                    h("span", null, h(Users, { size: 14 }), `${detail.memberCount || 0} membros`),
                    h("span", null, h(BookOpen, { size: 14 }), `${detail.postCount || 0} publicacoes`),
                    detail.myStatus ? h("span", null, h(Check, { size: 14 }), memberStatusLabel(detail.myStatus)) : h("span", null, h(Eye, { size: 14 }), "Visitante")
                  )
                )
              ),
              user && !canInteract && detail.visibility !== "private"
                ? h("button", { className: "bubble-join-btn", type: "button", onClick: joinBubble, disabled: detail.myStatus === "pending" },
                    h(Plus, { size: 15 }),
                    detail.myStatus === "pending" ? "Pedido enviado" : "Pedir entrada"
                  )
                : null,
              canManage || (user && detail.createdBy === user.id)
                ? h("button", { className: "bubble-settings-btn", type: "button", onClick: () => setSettingsOpen(true), title: "Configuracoes da Bubble", "aria-label": "Configuracoes da Bubble" }, h(Settings, { size: 18 }))
                : null
            ),
              pendingRequests.length ? h(BubbleJoinRequestAlert, { requests: pendingRequests, onModerate: moderateMember, openPublicProfile }) : null,
              h("div", { className: "bubble-body-grid forum-only" },
                h("div", { className: "bubble-feed" },
                  canInteract ? h("form", { className: "bubble-post-form", onSubmit: createPost },
                    h("input", { name: "title", placeholder: "Titulo da publicacao" }),
                    h("textarea", { name: "content", placeholder: "Compartilhe uma recomendacao, debate ou descoberta...", required: true }),
                    h("button", { className: "primary-btn", type: "submit" }, h(Check, { size: 15 }), "Publicar")
                  ) : h("div", { className: "bubble-readonly" }, h(Lock, { size: 16 }), user ? "Entre como membro ativo para publicar e comentar." : "Entre ou crie sua conta para participar do forum."),
                  (detail.posts || []).length
                    ? detail.posts.map((post) => h(BubblePost, { key: post.id, post, canInteract, canManage, onComment: createComment, onModeratePost: moderatePost, onModerateComment: moderateComment, openPublicProfile }))
                    : h(EmptyState, { text: "O feed desta Bubble ainda esta vazio." })
                )
              )
          )
        : h(EmptyState, { text: "Selecione uma Bubble para abrir o feed." })
    ),
    createOpen ? h(BubbleEditorModal, { onClose: () => setCreateOpen(false), onSave: createBubble }) : null,
    settingsOpen && detail ? h(BubbleSettingsModal, {
      detail,
      user,
      canManage,
      openPublicProfile,
      onClose: () => setSettingsOpen(false),
      onUpdateBubble: updateBubble,
      onInvite: inviteMember,
      onArchive: archiveBubble,
      onModerateMember: moderateMember
    }) : null
  );
}

function BubbleCard({ bubble, active, onSelect }) {
  return h("button", { className: `bubble-card ${active ? "active" : ""}`, type: "button", onClick: onSelect },
    bubble.coverUrl
      ? h("img", { className: "bubble-card-cover", src: bubble.coverUrl, alt: "" })
      : h("div", { className: "bubble-mark" }, bubble.name.slice(0, 2).toUpperCase()),
    h("div", null,
      h("strong", null, bubble.name),
      h("span", null, bubble.description || bubbleVisibilityLabel(bubble.visibility)),
      h("em", null, `${bubble.memberCount || 0} membros · ${bubble.postCount || 0} posts`)
    )
  );
}

function BubbleJoinRequestAlert({ requests, onModerate, openPublicProfile }) {
  return h("section", { className: "bubble-join-alert" },
    h("div", { className: "bubble-join-alert-head" },
      h("div", null,
        h("span", null, "Solicitacoes de entrada"),
        h("strong", null, `${requests.length} pedido${requests.length === 1 ? "" : "s"} pendente${requests.length === 1 ? "" : "s"}`)
      ),
      h(Users, { size: 20 })
    ),
    h("div", { className: "bubble-join-request-list" },
      requests.map((member) => h("div", { className: "bubble-join-request", key: member.id },
        h("div", null,
          h(UserProfileName, { user: { userId: member.userId, authorName: member.name }, onOpenProfile: openPublicProfile }),
          h("span", null, `Pediu para participar em ${formatDateTime(member.updatedAt || member.createdAt)}`)
        ),
        h("div", { className: "bubble-join-request-actions" },
          h("button", { type: "button", onClick: () => onModerate(member, { status: "active" }) }, h(Check, { size: 14 }), "Aprovar"),
          h("button", { type: "button", onClick: () => onModerate(member, { status: "removed" }) }, "Recusar")
        )
      ))
    )
  );
}

function BubbleMember({ member, canManage, currentUserId, onModerate, openPublicProfile }) {
  const canModerateMember = canManage && member.userId !== currentUserId;
  return h("div", { className: `bubble-member ${member.status !== "active" ? "moderated" : ""}` },
    h("div", null,
      h(UserProfileName, { user: { userId: member.userId, authorName: member.name }, onOpenProfile: openPublicProfile }),
      h("span", null, `${memberRoleLabel(member.role)} · ${memberStatusLabel(member.status)}`)
    ),
    canModerateMember ? h("div", { className: "bubble-mod-actions" },
      member.role === "member"
        ? h("button", { type: "button", onClick: () => onModerate(member, { role: "moderator" }) }, "Tornar moderador")
        : member.role === "moderator"
          ? h("button", { type: "button", onClick: () => onModerate(member, { role: "member" }) }, "Tornar membro")
          : null,
      member.status !== "removed" ? h("button", { type: "button", onClick: () => onModerate(member, { status: "removed" }) }, "Remover") : null,
      member.status !== "blocked" ? h("button", { type: "button", onClick: () => onModerate(member, { status: "blocked" }) }, "Bloquear") : null,
      member.status !== "active" ? h("button", { type: "button", onClick: () => onModerate(member, { status: "active" }) }, "Reativar") : null
    ) : null
  );
}

function BubbleSettingsModal({ detail, user, canManage, openPublicProfile, onClose, onUpdateBubble, onInvite, onArchive, onModerateMember }) {
  useEscapeToClose(onClose);
  const [name, setName] = useState(detail.name || "");
  const [description, setDescription] = useState(detail.description || "");
  const [coverUrl, setCoverUrl] = useState(detail.coverUrl || "");
  const [visibility, setVisibility] = useState(detail.visibility || "restricted");
  const [saving, setSaving] = useState(false);
  const canEditIdentity = detail.createdBy === user.id;

  async function submitIdentity(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onUpdateBubble({ name, description, coverUrl, visibility });
    } finally {
      setSaving(false);
    }
  }

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal bubble-settings-modal", role: "dialog", "aria-modal": "true", "aria-label": "Configurações da Bubble", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "modal-head" },
        h("div", null,
          h("p", null, "Bubble"),
          h("h2", null, "Configurações")
        ),
        h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
      ),
      canEditIdentity ? h("form", { className: "bubble-identity-form", onSubmit: submitIdentity },
        h("div", { className: "bubble-settings-cover" },
          coverUrl
            ? h(SafeImage, { src: coverUrl, className: "bubble-settings-cover-preview", fallbackClassName: "bubble-settings-cover-preview bubble-cover-empty", fallbackIcon: h(Image, { size: 26 }) })
            : h("div", { className: "bubble-settings-cover-preview bubble-cover-empty" }, h(Image, { size: 26 }))
        ),
        h("div", { className: "bubble-settings-fields" },
          h("div", { className: "article-editor-grid" },
            h("label", { className: "field" },
              h("span", null, h(Users, { size: 14 }), "Nome da Bubble"),
              h("input", { value: name, onChange: (event) => setName(event.target.value), required: true })
            ),
            h("label", { className: "field" },
              h("span", null, h(Lock, { size: 14 }), "Visibilidade"),
              h("select", { value: visibility, onChange: (event) => setVisibility(event.target.value) },
                h("option", { value: "public" }, "Publica"),
                h("option", { value: "restricted" }, "Restrita"),
                h("option", { value: "private" }, "Privada")
              )
            ),
            h("label", { className: "field full" },
              h("span", null, h(Image, { size: 14 }), "URL da imagem"),
              h("input", { value: coverUrl, onChange: (event) => setCoverUrl(event.target.value), placeholder: "https://..." })
            ),
            h("label", { className: "field full" },
              h("span", null, h(BookOpen, { size: 14 }), "Descricao"),
              h("textarea", { value: description, onChange: (event) => setDescription(event.target.value), rows: 3 })
            )
          ),
          h("div", { className: "form-actions bubble-identity-actions" },
            h("button", { className: "primary-btn", type: "submit", disabled: saving }, h(Check, { size: 15 }), saving ? "Salvando" : "Salvar Bubble")
          )
        )
      ) : null,
      canManage ? h("form", { className: "bubble-invite settings", onSubmit: onInvite },
        h("label", { className: "field" },
          h("span", null, h(Mail, { size: 14 }), "Convidar por email"),
          h("input", { name: "email", type: "email", placeholder: "usuario@myalbuns.com", required: true })
        ),
        h("button", { className: "ghost-btn", type: "submit" }, h(Plus, { size: 15 }), "Incluir")
      ) : null,
      h("section", { className: "bubble-members settings" },
        h("div", { className: "panel-title compact" },
          h("div", null,
            h("p", null, "Participantes"),
            h("h3", null, "Membros")
          ),
          h("span", { className: "bubble-count-pill" }, `${detail.memberCount || 0} membros`)
        ),
        h("div", { className: "bubble-member-list" },
          (detail.members || []).length
            ? detail.members.map((member) => h(BubbleMember, {
                key: member.id,
                member,
                canManage,
                currentUserId: user.id,
                onModerate: onModerateMember,
                openPublicProfile
              }))
            : h("p", null, "Nenhum membro ativo ainda.")
        )
      ),
      canManage ? h("div", { className: "bubble-settings-footer" },
        h("button", { className: "danger-btn", type: "button", onClick: onArchive }, h(Trash2, { size: 15 }), "Arquivar Bubble")
      ) : null
    )
  );
}

function BubblePost({ post, canInteract, canManage, onComment, onModeratePost, onModerateComment, openPublicProfile }) {
  return h("article", { className: `bubble-post ${post.status !== "active" ? "moderated" : ""}` },
    h("div", { className: "bubble-post-head" },
      h("div", { className: "bubble-post-topic-wrap" },
        post.title ? h("div", { className: "bubble-thread-topic" },
          h("span", null, h(MessageCircle, { size: 14 }), "Tópico de debate"),
          h("h3", null, post.title)
        ) : null,
        h("span", { className: "bubble-post-author-line" },
          h(UserProfileName, { user: post, onOpenProfile: openPublicProfile }),
          ` - ${formatDateTime(post.createdAt)}`
        ),
        post.status !== "active" ? h("em", { className: "moderation-status" }, moderationStatusLabel(post.status)) : null
      ),
      canManage ? h("div", { className: "bubble-mod-actions" },
        post.status !== "hidden" ? h("button", { type: "button", onClick: () => onModeratePost(post, "hidden") }, "Ocultar") : null,
        post.status !== "removed" ? h("button", { type: "button", onClick: () => onModeratePost(post, "removed") }, "Remover") : null,
        post.status !== "active" ? h("button", { type: "button", onClick: () => onModeratePost(post, "active") }, "Restaurar") : null
      ) : null
    ),
    h("p", null, post.content),
    h("div", { className: "bubble-post-stats" },
      h("span", null, h(MessageCircle, { size: 14 }), `${countComments(post.comments || [])} respostas`)
    ),
    h("div", { className: "bubble-comments" },
      canInteract ? h("form", { className: "bubble-comment-form", onSubmit: (event) => onComment(event, post.id) },
        h("input", { name: "content", placeholder: "Participe da conversa", required: true }),
        h("button", { type: "submit" }, "Enviar")
      ) : null,
      (post.comments || []).length
        ? h("div", { className: "bubble-comment-tree" },
            post.comments.map((comment) => h(BubbleComment, {
              key: comment.id,
              post,
              comment,
              canInteract,
              canManage,
              onComment,
              onModerateComment,
              openPublicProfile
            }))
          )
        : h("p", { className: "bubble-no-comments" }, "Seja o primeiro a responder.")
    )
  );
}

function BubbleComment({ post, comment, canInteract, canManage, onComment, onModerateComment, openPublicProfile }) {
  const [replying, setReplying] = useState(false);
  return h("div", { className: `bubble-comment ${comment.status !== "active" ? "moderated" : ""}` },
    h("div", { className: "bubble-comment-line" },
      h(UserAvatar, { user: comment, onOpenProfile: openPublicProfile }),
      h("div", { className: "bubble-comment-content" },
        h("div", { className: "bubble-comment-meta" },
          h(UserProfileName, { user: comment, onOpenProfile: openPublicProfile }),
          h("span", null, formatDateTime(comment.createdAt)),
          comment.status !== "active" ? h("em", { className: "moderation-status" }, moderationStatusLabel(comment.status)) : null
        ),
        h("p", null, comment.content),
        h("div", { className: "bubble-comment-actions" },
          canInteract ? h("button", { type: "button", onClick: () => setReplying((value) => !value) }, h(Reply, { size: 13 }), "Responder") : null,
          canManage ? h("div", { className: "bubble-mod-actions" },
            comment.status !== "hidden" ? h("button", { type: "button", onClick: () => onModerateComment(post, comment, "hidden") }, "Ocultar") : null,
            comment.status !== "removed" ? h("button", { type: "button", onClick: () => onModerateComment(post, comment, "removed") }, "Remover") : null,
            comment.status !== "active" ? h("button", { type: "button", onClick: () => onModerateComment(post, comment, "active") }, "Restaurar") : null
          ) : null
        ),
        replying ? h("form", { className: "bubble-comment-form nested", onSubmit: async (event) => { await onComment(event, post.id, comment.id); setReplying(false); } },
          h("input", { name: "content", placeholder: `Responder ${comment.authorName || "comentario"}...`, required: true }),
          h("button", { type: "submit" }, "Responder")
        ) : null,
        (comment.replies || []).length ? h("div", { className: "bubble-comment-replies" },
          comment.replies.map((reply) => h(BubbleComment, {
            key: reply.id,
            post,
            comment: reply,
            canInteract,
            canManage,
            onComment,
            onModerateComment,
            openPublicProfile
          }))
        ) : null
      )
    )
  );
}

function CommunityComments({ targetLabel, endpoint, isAdmin, openPublicProfile, canComment = true }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const total = countComments(comments);

  async function loadComments() {
    setLoading(true);
    try {
      const data = await api(endpoint);
      setComments(data.comments || []);
    } finally {
      setLoading(false);
    }
  }

  async function submitComment(event, parentCommentId = "") {
    event.preventDefault();
    if (!canComment) return;
    const form = event.currentTarget;
    const payload = formData(form);
    if (parentCommentId) payload.parentCommentId = parentCommentId;
    setSending(true);
    try {
      const data = await api(endpoint, { method: "POST", body: payload });
      setComments(data.comments || []);
      form.reset();
    } finally {
      setSending(false);
    }
  }

  async function moderateComment(comment, status) {
    const data = await api(`${endpoint}/${encodeURIComponent(comment.id)}`, { method: "PATCH", body: { status } });
    setComments(data.comments || []);
  }

  useEffect(() => {
    loadComments().catch(() => setLoading(false));
  }, [endpoint]);

  return h("section", { className: "community-discussion" },
    h("div", { className: "community-discussion-head" },
      h("div", null,
        h("span", null, "Discussao da comunidade"),
        h("h3", null, `Comentarios${total ? ` (${total})` : ""}`)
      ),
      h(MessageCircle, { size: 20 })
    ),
    canComment
      ? h("form", { className: "bubble-comment-form community-comment-form", onSubmit: submitComment },
          h("input", { name: "content", maxLength: 800, placeholder: `Comente este ${targetLabel}...`, required: true }),
          h("button", { type: "submit", disabled: sending }, sending ? "Enviando" : "Comentar")
        )
      : h("div", { className: "bubble-readonly community-readonly" }, h(Lock, { size: 16 }), "Entre ou crie sua conta para comentar."),
    loading
      ? h("p", { className: "bubble-no-comments" }, "Carregando comentarios...")
      : comments.length
        ? h("div", { className: "bubble-comment-tree community-comment-tree" },
            comments.map((comment) => h(CommunityComment, {
              key: comment.id,
              comment,
              isAdmin,
              canComment,
              onReply: submitComment,
              onModerate: moderateComment,
              openPublicProfile
            }))
          )
        : h("p", { className: "bubble-no-comments" }, "Seja o primeiro a comentar.")
  );
}

function CommunityComment({ comment, isAdmin, canComment = true, onReply, onModerate, openPublicProfile }) {
  const [replying, setReplying] = useState(false);
  return h("div", { className: `bubble-comment community-comment ${comment.status !== "active" ? "moderated" : ""}` },
    h("div", { className: "bubble-comment-line" },
      h(UserAvatar, { user: comment, onOpenProfile: openPublicProfile }),
      h("div", { className: "bubble-comment-content" },
        h("div", { className: "bubble-comment-meta" },
          h(UserProfileName, { user: comment, onOpenProfile: openPublicProfile }),
          h("span", null, formatDateTime(comment.createdAt)),
          comment.status !== "active" ? h("em", { className: "moderation-status" }, moderationStatusLabel(comment.status)) : null
        ),
        h("p", null, comment.content),
        h("div", { className: "bubble-comment-actions" },
          canComment ? h("button", { type: "button", onClick: () => setReplying((value) => !value) }, h(Reply, { size: 13 }), "Responder") : null,
          isAdmin ? h("div", { className: "bubble-mod-actions" },
            comment.status !== "hidden" ? h("button", { type: "button", onClick: () => onModerate(comment, "hidden") }, "Ocultar") : null,
            comment.status !== "removed" ? h("button", { type: "button", onClick: () => onModerate(comment, "removed") }, "Remover") : null,
            comment.status !== "active" ? h("button", { type: "button", onClick: () => onModerate(comment, "active") }, "Restaurar") : null
          ) : null
        ),
        replying && canComment ? h("form", { className: "bubble-comment-form nested", onSubmit: async (event) => { await onReply(event, comment.id); setReplying(false); } },
          h("input", { name: "content", maxLength: 800, placeholder: `Responder ${comment.authorName || "comentario"}...`, required: true }),
          h("button", { type: "submit" }, "Responder")
        ) : null,
        (comment.replies || []).length ? h("div", { className: "bubble-comment-replies" },
          comment.replies.map((reply) => h(CommunityComment, {
            key: reply.id,
              comment: reply,
              isAdmin,
              canComment,
              onReply,
              onModerate,
              openPublicProfile
            }))
        ) : null
      )
    )
  );
}

function countComments(comments = []) {
  return comments.reduce((total, comment) => total + 1 + countComments(comment.replies || []), 0);
}

function BubbleEditorModal({ onClose, onSave }) {
  useEscapeToClose(onClose);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [visibility, setVisibility] = useState("restricted");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ name, description, visibility, coverUrl });
    } finally {
      setSaving(false);
    }
  }

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal bubble-editor-modal", role: "dialog", "aria-modal": "true", "aria-label": "Nova Bubble", onMouseDown: (event) => event.stopPropagation() },
      h("form", { onSubmit: submit },
        h("div", { className: "modal-head" },
          h("div", null,
            h("p", null, "Comunidade"),
            h("h2", null, "Nova Bubble")
          ),
          h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
        ),
        h("div", { className: "bubble-editor-layout" },
          h("div", { className: "bubble-cover-panel" },
            coverUrl
              ? h("img", { className: "bubble-cover-preview", src: coverUrl, alt: "" })
              : h("div", { className: "bubble-cover-empty" },
                  h(Image, { size: 30 }),
                  h("strong", null, "Imagem da Bubble"),
                  h("span", null, "Use uma capa para deixar a comunidade mais reconhecivel.")
                ),
            h("label", { className: "field bubble-cover-input" },
              h("span", null, h(Image, { size: 14 }), "URL da imagem"),
              h("input", { value: coverUrl, onChange: (event) => setCoverUrl(event.target.value), placeholder: "https://..." })
            )
          ),
          h("div", { className: "bubble-editor-fields" },
            h("div", { className: "article-editor-grid" },
              h("label", { className: "field" },
                h("span", null, h(Users, { size: 14 }), "Nome"),
                h("input", { value: name, onChange: (event) => setName(event.target.value), required: true })
              ),
              h("label", { className: "field" },
                h("span", null, h(Lock, { size: 14 }), "Visibilidade"),
                h("select", { value: visibility, onChange: (event) => setVisibility(event.target.value) },
                  h("option", { value: "public" }, "Publica"),
                  h("option", { value: "restricted" }, "Restrita"),
                  h("option", { value: "private" }, "Privada")
                )
              ),
              h("label", { className: "field full" },
                h("span", null, h(BookOpen, { size: 14 }), "Descricao"),
                h("textarea", { value: description, onChange: (event) => setDescription(event.target.value), rows: 5 })
              )
            )
          )
        ),
        h("div", { className: "form-actions" },
          h("button", { className: "primary-btn", type: "submit", disabled: saving }, h(Check, { size: 15 }), saving ? "Salvando" : "Criar Bubble")
        )
      )
    )
  );
}

function CommunityNewsFeature({ item, onView }) {
  return h("article", { className: "news-feature" },
    h(SafeImage, { src: item.imageUrl, fallbackClassName: "news-cover-fallback", fallbackIcon: h(Newspaper, { size: 44 }) }),
    h("div", { className: "news-feature-copy" },
      h("p", null, "Notícia em destaque"),
      h("h2", null, item.title),
      h("span", null, `${item.sourceName || "TMDQA"} · ${displayReleaseDate(item.publishedAt) || "sem data"}`),
      item.summary ? h("em", null, item.summary) : null,
      h("div", { className: "news-feature-actions" },
        h("button", { className: "ghost-btn", type: "button", onClick: () => onView(item) }, h(Eye, { size: 16 }), "Visualizar"),
        item.url ? h("a", { className: "primary-link", href: item.url, target: "_blank", rel: "noreferrer" }, "Ler no TMDQA") : null
      )
    )
  );
}

function CommunityNewsPoster({ item, onView }) {
  return h("article", { className: "release-poster" },
    h(SafeImage, { src: item.imageUrl, fallbackClassName: "poster-fallback", fallbackIcon: h(Newspaper, { size: 28 }) }),
    h("div", null,
      h("strong", null, item.title),
      h("span", null, displayReleaseDate(item.publishedAt) || item.sourceName || "TMDQA")
    ),
    h("div", { className: "release-poster-actions" },
      h("button", { type: "button", onClick: () => onView(item), title: "Visualizar notícia" }, h(Eye, { size: 15 })),
      item.url ? h("a", { href: item.url, target: "_blank", rel: "noreferrer", title: "Ler no TMDQA" }, h(Newspaper, { size: 15 })) : null
    )
  );
}

function CommunityNewsStoryCard({ item, onView }) {
  return h("article", { className: "news-story" },
    h(SafeImage, { src: item.imageUrl, fallbackClassName: "story-cover-fallback", fallbackIcon: h(Newspaper, { size: 26 }) }),
    h("div", { className: "news-story-copy" },
      h("p", null, `${item.sourceName || "TMDQA"} · ${displayReleaseDate(item.publishedAt) || "sem data"}`),
      h("h3", null, item.title),
      h("span", null, item.summary || "Notícia musical publicada no TMDQA."),
      h("div", { className: "news-story-actions" },
        h("button", { className: "ghost-btn small", type: "button", onClick: () => onView(item) }, h(Eye, { size: 14 }), "Visualizar"),
        item.url ? h("a", { className: "ghost-link small", href: item.url, target: "_blank", rel: "noreferrer" }, "Ler no TMDQA") : null
      )
    )
  );
}

function CommunityNewsDetailModal({ item, onClose }) {
  useEscapeToClose(onClose);
  const paragraphs = articleParagraphs(item.content || item.summary);
  const readingTime = Math.max(1, Math.ceil((item.content || item.summary || "").split(/\s+/).filter(Boolean).length / 220));

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal community-news-modal", role: "dialog", "aria-modal": "true", "aria-label": "Leitura da not?cia", onMouseDown: (event) => event.stopPropagation() },
      h("button", { className: "ghost-btn small community-news-close", type: "button", onClick: onClose }, "Fechar"),
      h("header", { className: "community-news-head" },
        h("p", null, item.sourceName || "TMDQA"),
        h("h2", null, item.title || "Not?cia musical"),
        item.summary ? h("span", null, item.summary) : null,
        h("div", { className: "community-news-byline" },
          h("span", null, h(BookOpen, { size: 14 }), item.author || "TMDQA"),
          h("span", null, h(Calendar, { size: 14 }), displayReleaseDate(item.publishedAt) || "Sem data"),
          h("span", null, h(Clock, { size: 14 }), `${readingTime} min de leitura`)
        )
      ),
      h("div", { className: "community-news-layout" },
        h("article", { className: "community-news-article" },
          h(SafeImage, { src: item.imageUrl, className: "community-news-cover", fallbackClassName: "community-news-cover community-news-cover-fallback", fallbackIcon: h(Newspaper, { size: 54 }) }),
          h("small", null, item.sourceName || "Tenho Mais Discos Que Amigos!"),
          paragraphs.length
            ? h("div", { className: "community-news-body" }, paragraphs.map((paragraph, index) => h("p", { key: index }, paragraph)))
            : h("p", { className: "community-news-empty" }, "Sem resumo informado para esta not?cia.")
        ),
        h("aside", { className: "community-news-sidebar" },
          h("h3", null, "Sobre a not?cia"),
          h("div", { className: "community-news-info" },
            h("span", null, "Fonte"),
            h("strong", null, item.sourceName || "TMDQA")
          ),
          h("div", { className: "community-news-info" },
            h("span", null, "Publicado em"),
            h("strong", null, displayReleaseDate(item.publishedAt) || "Sem data")
          ),
          h("div", { className: "community-news-info" },
            h("span", null, "Origem"),
            h("strong", null, "RSS editorial")
          ),
          item.url ? h("a", { className: "primary-link community-news-read", href: item.url, target: "_blank", rel: "noreferrer" }, "Ler mat?ria completa") : null
        )
      )
    )
  );
}

function articleParagraphs(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const paragraphs = [];
  let current = "";
  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if ((current + " " + sentence).trim().length > 420 && current) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.slice(0, 8);
}

function NewsFeature({ item, onView }) {
  return h("article", { className: "news-feature" },
    item.imageUrl ? h("img", { src: item.imageUrl, alt: "" }) : h("div", { className: "news-cover-fallback" }, h(Newspaper, { size: 44 })),
    h("div", { className: "news-feature-copy" },
      h("p", null, "Lançamento em destaque"),
      h("h2", null, album.album),
      h("span", null, `${album.artist || "Artista não informado"} · ${displayReleaseDate(album.releaseDate) || album.releaseYear || "sem data"}`),
      h("div", { className: "news-feature-actions" },
        h("button", { className: "ghost-btn", type: "button", onClick: () => onView(album) }, h(Eye, { size: 16 }), "Visualizar"),
        h("button", { className: "primary-btn", type: "button", onClick: () => onImport(album) }, h(Plus, { size: 16 }), "Importar"),
        album.spotifyUrl ? h("a", { className: "ghost-link", href: album.spotifyUrl, target: "_blank", rel: "noreferrer" }, "Abrir no Spotify") : null
      )
    )
  );
}

function ReleasePoster({ album, onView }) {
  return h("article", { className: "release-poster" },
    album.coverUrl ? h("img", { src: album.coverUrl, alt: "" }) : h("div", { className: "poster-fallback" }, h(Disc3, { size: 28 })),
    h("div", null,
      h("strong", null, album.album),
      h("span", null, album.artist || "Artista não informado")
    ),
    h("div", { className: "release-poster-actions" },
      h("button", { type: "button", onClick: () => onView(album), title: "Visualizar lançamento" }, h(Eye, { size: 15 })),
      album.spotifyUrl ? h("a", { href: album.spotifyUrl, target: "_blank", rel: "noreferrer", title: "Abrir no Spotify" }, h(Headphones, { size: 15 })) : null
    )
  );
}

function ReleaseStoryCard({ album, onView }) {
  return h("article", { className: "news-story" },
    album.coverUrl ? h("img", { src: album.coverUrl, alt: "" }) : h("div", { className: "story-cover-fallback" }, h(Disc3, { size: 26 })),
    h("div", { className: "news-story-copy" },
      h("p", null, `${album.genre || "Lançamento"} · ${displayReleaseDate(album.releaseDate) || album.releaseYear || "sem data"}`),
      h("h3", null, album.album),
      h("span", null, `${album.artist || "Artista não informado"} · ${album.tracks || 0} faixas`),
      h("div", { className: "news-story-actions" },
        h("button", { className: "ghost-btn small", type: "button", onClick: () => onView(album) }, h(Eye, { size: 14 }), "Visualizar"),
        album.spotifyUrl ? h("a", { className: "ghost-link small", href: album.spotifyUrl, target: "_blank", rel: "noreferrer" }, "Abrir no Spotify") : null
      )
    )
  );
}

function ReleaseDetailModal({ album, onClose, onImport }) {
  useEscapeToClose(onClose);
  const details = [
    [Disc3, "Álbum", album.album],
    [Headphones, "Artista", album.artist],
    [Calendar, "Lançamento", displayReleaseDate(album.releaseDate) || album.releaseYear],
    [Music2, "Gênero", album.genre],
    [Music2, "Subgênero", album.subgenre],
    [Clock, "Duração", album.durationMin ? `${album.durationMin} min` : ""],
    [Music2, "Faixas", album.tracks],
    [Sparkles, "Origem", "Spotify News"]
  ];

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal release-detail-modal", role: "dialog", "aria-modal": "true", "aria-label": "Detalhes do lançamento", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "log-detail-hero" },
        h("div", { className: "log-cover-wrap" },
          album.coverUrl
            ? h("img", { className: "log-cover", src: album.coverUrl, alt: "" })
            : h("div", { className: "log-cover log-cover-fallback" }, h(Disc3, { size: 48 }))
        ),
        h("div", { className: "log-hero-copy" },
          h("p", null, "Lançamento"),
          h("h2", null, album.album || "Detalhes do lançamento"),
          h("span", null, album.artist || "Artista não informado"),
          h("div", { className: "log-hero-meta" },
            h("span", null, h(Calendar, { size: 14 }), displayReleaseDate(album.releaseDate) || "Sem data"),
            h("span", null, h(Music2, { size: 14 }), album.genre || "Sem gênero"),
            h("span", null, h(Disc3, { size: 14 }), `${album.tracks || 0} faixas`)
          )
        ),
        h("button", { className: "ghost-btn small log-close", type: "button", onClick: onClose }, "Fechar")
      ),
      h("div", { className: "log-detail-grid" },
        details.map(([Icon, label, value]) => h("div", { className: "detail-item", key: label },
          h("span", null, h(Icon, { size: 14 }), label),
          h("strong", null, value || "—")
        )),
        h("div", { className: "detail-item detail-notes" },
          h("span", null, h(BookOpen, { size: 14 }), "Ações"),
          h("div", { className: "release-modal-actions" },
            h("button", { className: "primary-btn small", type: "button", onClick: () => onImport(album) }, h(Plus, { size: 14 }), "Importar"),
            album.spotifyUrl ? h("a", { className: "ghost-link small", href: album.spotifyUrl, target: "_blank", rel: "noreferrer" }, "Abrir no Spotify") : null
          )
        )
      )
    )
  );
}

function ArticleDetailModal({ article, onClose, isAdmin, openPublicProfile, onEdit, canComment = true }) {
  useEscapeToClose(onClose);
  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal article-detail-modal", role: "dialog", "aria-modal": "true", "aria-label": "Leitura do artigo", onMouseDown: (event) => event.stopPropagation() },
      article.coverUrl ? h(SafeImage, { src: article.coverUrl, className: "article-detail-cover", fallbackClassName: "article-detail-cover article-detail-cover-fallback", fallbackIcon: h(BookOpen, { size: 44 }) }) : null,
      h("div", { className: "article-detail-head" },
        h("div", null,
          h("p", null, article.scope === "profile" ? (article.status === "published" ? "Artigo do perfil" : article.status === "archived" ? "Artigo arquivado" : "Rascunho do perfil") : (article.status === "published" ? "Newsletter editorial" : article.status === "archived" ? "Artigo arquivado" : "Rascunho editorial")),
          h("h2", null, article.title),
          h("span", null, `${article.authorName || "MyAlbums"} · ${article.publishedAt ? formatDate(article.publishedAt) : formatDate(article.updatedAt)}`)
        ),
        h("div", { className: "article-detail-actions" },
          isAdmin ? h("button", { className: "ghost-btn small", type: "button", onClick: () => onEdit(article) }, "Editar") : null,
          h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
        )
      ),
      article.summary ? h("p", { className: "article-summary" }, article.summary) : null,
      h("div", { className: "article-body" }, renderArticleContent(article.content)),
      h(CommunityComments, { targetLabel: "artigo", endpoint: `/api/articles/${encodeURIComponent(article.id)}/comments`, isAdmin, openPublicProfile, canComment })
    )
  );
}

function ArticleEditorModal({ article, onClose, onSave, contextLabel = "Newsletter editorial" }) {
  useEscapeToClose(onClose);
  const [title, setTitle] = useState(article.title || "");
  const [summary, setSummary] = useState(article.summary || "");
  const [coverUrl, setCoverUrl] = useState(article.coverUrl || "");
  const [content, setContent] = useState(article.content || "");
  const [status, setStatus] = useState(article.status || "draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ title, summary, coverUrl, content, status }, article.id || "");
    } finally {
      setSaving(false);
    }
  }

  return h("div", { className: "modal-backdrop editor-modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal article-editor-modal", role: "dialog", "aria-modal": "true", "aria-label": "Editor de artigo", onMouseDown: (event) => event.stopPropagation() },
      h("form", { onSubmit: submit },
        h("div", { className: "modal-head" },
          h("div", null,
            h("p", null, contextLabel),
            h("h2", null, article.id ? "Editar artigo" : "Novo artigo")
          ),
          h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
        ),
        h("div", { className: "article-editor-grid" },
          h("label", { className: "field" },
            h("span", null, h(BookOpen, { size: 14 }), "Titulo"),
            h("input", { value: title, onChange: (event) => setTitle(event.target.value), required: true })
          ),
          h("label", { className: "field" },
            h("span", null, h(Flag, { size: 14 }), "Status"),
            h("select", { value: status, onChange: (event) => setStatus(event.target.value) },
              h("option", { value: "draft" }, "Rascunho"),
              h("option", { value: "published" }, "Publicado"),
              h("option", { value: "archived" }, "Arquivado")
            )
          ),
          h("label", { className: "field full" },
            h("span", null, h(Eye, { size: 14 }), "URL da capa"),
            h("input", { value: coverUrl, onChange: (event) => setCoverUrl(event.target.value), placeholder: "https://..." })
          ),
          h("label", { className: "field full" },
            h("span", null, h(Sparkles, { size: 14 }), "Resumo"),
            h("textarea", { value: summary, onChange: (event) => setSummary(event.target.value), rows: 3 })
          ),
          h("label", { className: "field full" },
            h("span", null, h(BookOpen, { size: 14 }), "Conteudo"),
            h("textarea", { className: "article-content-input", value: content, onChange: (event) => setContent(event.target.value), required: true, placeholder: "Use linhas em branco para separar paragrafos. # cria um titulo." })
          )
        ),
        h("div", { className: "form-actions" },
          h("button", { className: "primary-btn", type: "submit", disabled: saving }, h(Check, { size: 16 }), saving ? "Salvando" : "Salvar artigo")
        )
      )
    )
  );
}

function PodcastDetailModal({ episode, onClose, isAdmin, openPublicProfile, onEdit, onPodcastPlaybackChange, canComment = true }) {
  useEscapeToClose(onClose);
  const paragraphs = articleParagraphs(episode.description || episode.summary);
  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal podcast-detail-modal", role: "dialog", "aria-modal": "true", "aria-label": "Leitura do episodio", onMouseDown: (event) => event.stopPropagation() },
      h(SafeImage, { src: episode.coverUrl, className: "podcast-detail-cover", fallbackClassName: "podcast-detail-cover podcast-detail-cover-fallback", fallbackIcon: h(Headphones, { size: 52 }) }),
      h("div", { className: "article-detail-head" },
        h("div", null,
          h("p", null, episode.scope === "profile" ? (episode.status === "published" ? "Podcast do perfil" : episode.status === "archived" ? "Podcast arquivado" : "Rascunho do perfil") : (episode.status === "published" ? "Podcast publicado" : episode.status === "archived" ? "Podcast arquivado" : "Rascunho de podcast")),
          h("h2", null, episode.title),
          h("span", null, `${episode.authorName || "MyAlbums"} · ${episode.publishedAt ? formatDate(episode.publishedAt) : formatDate(episode.updatedAt)}${episode.durationMin ? ` · ${episode.durationMin} min` : ""}`)
        ),
        h("div", { className: "article-detail-actions" },
          isAdmin ? h("button", { className: "ghost-btn small", type: "button", onClick: () => onEdit(episode) }, "Editar") : null,
          h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
        )
      ),
      episode.summary ? h("p", { className: "article-summary" }, episode.summary) : null,
      episode.playbackAudioUrl ? h("div", { className: "podcast-player" }, h(PodcastInlinePlayer, { episode, onPodcastPlaybackChange })) : null,
      h("div", { className: "article-body" }, paragraphs.length ? paragraphs.map((paragraph, index) => h("p", { key: index }, paragraph)) : h("p", null, "Sem descricao informada.")),
      episode.externalUrl ? h("a", { className: "primary-link podcast-external-link", href: episode.externalUrl, target: "_blank", rel: "noreferrer" }, "Abrir episodio completo") : null,
      h(CommunityComments, { targetLabel: "episodio", endpoint: `/api/podcasts/${encodeURIComponent(episode.id)}/comments`, isAdmin, openPublicProfile, canComment })
    )
  );
}

function PodcastEditorModal({ episode, onClose, onSave, contextLabel = "Podcast da Comunidade" }) {
  useEscapeToClose(onClose);
  const [title, setTitle] = useState(episode.title || "");
  const [summary, setSummary] = useState(episode.summary || "");
  const [description, setDescription] = useState(episode.description || "");
  const [audioUrl, setAudioUrl] = useState(episode.audioUrl || "");
  const [externalUrl, setExternalUrl] = useState(episode.externalUrl || "");
  const [coverUrl, setCoverUrl] = useState(episode.coverUrl || "");
  const [durationMin, setDurationMin] = useState(episode.durationMin || "");
  const [status, setStatus] = useState(episode.status || "draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({ title, summary, description, audioUrl, externalUrl, coverUrl, durationMin, status }, episode.id || "");
    } finally {
      setSaving(false);
    }
  }

  return h("div", { className: "modal-backdrop editor-modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal article-editor-modal podcast-editor-modal", role: "dialog", "aria-modal": "true", "aria-label": "Editor de podcast", onMouseDown: (event) => event.stopPropagation() },
      h("form", { onSubmit: submit },
        h("div", { className: "modal-head" },
          h("div", null,
            h("p", null, contextLabel),
            h("h2", null, episode.id ? "Editar episodio" : "Novo episodio")
          ),
          h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
        ),
        h("div", { className: "article-editor-grid" },
          h("label", { className: "field" },
            h("span", null, h(BookOpen, { size: 14 }), "Titulo"),
            h("input", { value: title, onChange: (event) => setTitle(event.target.value), required: true })
          ),
          h("label", { className: "field" },
            h("span", null, h(Flag, { size: 14 }), "Status"),
            h("select", { value: status, onChange: (event) => setStatus(event.target.value) },
              h("option", { value: "draft" }, "Rascunho"),
              h("option", { value: "published" }, "Publicado"),
              h("option", { value: "archived" }, "Arquivado")
            )
          ),
          h("label", { className: "field full" },
            h("span", null, h(Image, { size: 14 }), "URL da capa"),
            h("input", { value: coverUrl, onChange: (event) => setCoverUrl(event.target.value), placeholder: "https://..." })
          ),
          h("label", { className: "field" },
            h("span", null, h(Headphones, { size: 14 }), "URL do audio"),
            h("input", { value: audioUrl, onChange: (event) => setAudioUrl(event.target.value), placeholder: "Cole o link compartilhado do Google Drive ou uma URL de áudio" })
          ),
          h("label", { className: "field" },
            h("span", null, h(Clock, { size: 14 }), "Duracao min"),
            h("input", { type: "number", min: "0", step: "1", value: durationMin, onChange: (event) => setDurationMin(event.target.value) })
          ),
          h("label", { className: "field full" },
            h("span", null, h(Newspaper, { size: 14 }), "URL externa"),
            h("input", { value: externalUrl, onChange: (event) => setExternalUrl(event.target.value), placeholder: "Spotify, YouTube, site do episodio..." })
          ),
          h("label", { className: "field full" },
            h("span", null, h(Sparkles, { size: 14 }), "Resumo"),
            h("textarea", { value: summary, onChange: (event) => setSummary(event.target.value), rows: 3 })
          ),
          h("label", { className: "field full" },
            h("span", null, h(BookOpen, { size: 14 }), "Descricao"),
            h("textarea", { className: "article-content-input", value: description, onChange: (event) => setDescription(event.target.value), required: true, placeholder: "Use linhas em branco para separar paragrafos." })
          )
        ),
        h("div", { className: "form-actions" },
          h("button", { className: "primary-btn", type: "submit", disabled: saving }, h(Check, { size: 16 }), saving ? "Salvando" : "Salvar episodio")
        )
      )
    )
  );
}

function ManualCatalogForm({ db, reload, notify, close }) {
  async function save(event) {
    event.preventDefault();
    await api("/api/catalog", { method: "POST", body: formData(event.currentTarget) });
    notify("Álbum cadastrado manualmente.");
    close();
    await reload();
  }

  return h("form", { className: "form-grid inline-form", onSubmit: save },
    h(InputField, { name: "album", label: "Álbum" }),
    h(InputField, { name: "artist", label: "Artista" }),
    h(InputField, { name: "releaseYear", label: "Ano lançamento", type: "number" }),
    h(SelectField, { name: "genre", label: "Gênero", options: db.lists.genres }),
    h(InputField, { name: "subgenre", label: "Subgênero" }),
    h(InputField, { name: "country", label: "Pais" }),
    h(InputField, { name: "label", label: "Gravadora" }),
    h(InputField, { name: "tracks", label: "Faixas", type: "number" }),
    h(InputField, { name: "durationMin", label: "Duração min", type: "number" }),
    h(SelectField, { name: "hasPhysical", label: "Tenho físico?", options: db.lists.yesNo, defaultValue: "Não" }),
    h(SelectField, { name: "physicalFormat", label: "Formato físico", options: db.lists.formats }),
    h(InputField, { name: "collectionStatus", label: "Status coleção" }),
    h(TextAreaField, { name: "observations", label: "Observações" }),
    h("div", { className: "form-actions" }, h("button", { className: "primary-btn", type: "submit" }, h(Check, { size: 16 }), "Salvar álbum"))
  );
}

function RegisterView({ db, reload, notify, selectedCatalogId }) {
  const [catalogId, setCatalogId] = useState(selectedCatalogId || "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = db.catalog.find((item) => item.id === catalogId) || null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selectedCatalogId) setCatalogId(selectedCatalogId);
  }, [selectedCatalogId]);

  async function save(event) {
    event.preventDefault();
    if (!catalogId) {
      setMessage("Escolha um álbum do catálogo antes de salvar.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const payload = { ...formData(event.currentTarget), catalogId };
      await api("/api/log", { method: "POST", body: payload });
      setMessage("Audição salva com sucesso.");
      notify("");
      setCatalogId("");
      await reload();
    } catch (error) {
      setMessage(error.message);
      notify(error.message);
    } finally {
      setSaving(false);
    }
  }

  return h("div", { className: "screen-grid" },
    h("section", { className: "panel" },
      h("div", { className: "panel-title" },
        h("div", null, h("p", null, "Diário de escuta"), h("h2", null, "Nova audição")),
        h(Headphones, { size: 22 })
      ),
      db.catalog.length
        ? h(React.Fragment, null,
          h("form", { className: "form-grid", onSubmit: save, key: catalogId || "blank-register-form" },
            h("div", { className: "field album-picker-field" },
              h("span", null, h(Disc3, { size: 14 }), "Álbum do catálogo"),
              h("button", { className: `album-picker-trigger ${selected ? "selected" : ""}`, type: "button", onClick: () => setPickerOpen(true) },
                selected
                  ? [
                      selected.coverUrl ? h("img", { key: "cover", src: selected.coverUrl, alt: "" }) : h("div", { key: "cover", className: "mini-cover" }, h(Disc3, { size: 18 })),
                      h("span", { key: "copy" }, h("strong", null, selected.album), h("em", null, selected.artist || "Artista não informado"))
                    ]
                  : [
                      h("div", { key: "cover", className: "mini-cover" }, h(Plus, { size: 18 })),
                      h("span", { key: "copy" }, h("strong", null, "Abrir Catálogo"))
                    ]
              )
            ),
            h(InputField, { name: "date", label: "Data", icon: Calendar, type: "date", defaultValue: today() }),
            h(SelectField, { name: "format", label: "Formato", icon: Disc3, options: db.lists.formats }),
            h(SelectField, { name: "platform", label: "Plataforma/Mídia", icon: Headphones, options: db.lists.platforms }),
            h(SelectField, { name: "listeningType", label: "Tipo de audição", icon: Headphones, options: db.lists.listeningTypes }),
            h(SelectField, { name: "genre", label: "Gênero", icon: Music2, options: db.lists.genres, defaultValue: selected?.genre || "" }),
            h(InputField, { name: "tracksHeard", label: "Faixas ouvidas", icon: Music2, type: "number", defaultValue: selected?.tracks || "" }),
            h(InputField, { name: "durationMin", label: "Duração min", icon: Clock, type: "number", defaultValue: selected?.durationMin || "" }),
            h(RatingField, { name: "rating", label: "Nota 0-5", icon: Star }),
            h(SelectField, { name: "mood", label: "Humor", icon: Sparkles, options: db.lists.moods }),
            h(SelectField, { name: "location", label: "Local", icon: MapPin, options: db.lists.locations }),
            h(SelectField, { name: "company", label: "Companhia", icon: Users, options: db.lists.companies }),
            h(SelectField, { name: "favorite", label: "Favorito?", icon: Star, options: db.lists.yesNo, defaultValue: "Não" }),
            h(SelectField, { name: "listenAgain", label: "Reouvir?", icon: RefreshCw, options: db.lists.yesNo, defaultValue: "Sim" }),
            h(TextAreaField, { name: "observations", label: "Observações", icon: BookOpen }),
            h("div", { className: "form-actions" },
              h("button", { className: "primary-btn wide", type: "submit", disabled: saving }, saving ? h(Loader2, { className: "spin", size: 16 }) : h(Check, { size: 16 }), saving ? "Salvando..." : "Salvar audição"),
              message ? h("span", { className: "inline-message" }, message) : null
            )
          ),
          pickerOpen ? h(CatalogPickerModal, {
            catalog: db.catalog,
            selectedId: catalogId,
            onClose: () => setPickerOpen(false),
            onSelect: (item) => {
              setCatalogId(item.id);
              setPickerOpen(false);
              setMessage("");
            }
          }) : null
        )
        : h(EmptyState, { text: "Cadastre um álbum antes de registrar uma audição." })
    ),
    h(LogTable, { log: db.listeningLog, catalog: db.catalog, reload, notify })
  );
}

function CatalogPickerModal({ catalog, selectedId, onClose, onSelect }) {
  useEscapeToClose(onClose);
  const [query, setQuery] = useState("");
  const [previewAlbum, setPreviewAlbum] = useState(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = catalog.filter((item) => {
    const haystack = [item.album, item.artist, item.releaseYear, item.genre, item.decade].join(" ").toLowerCase();
    return !normalizedQuery || haystack.includes(normalizedQuery);
  });

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal", role: "dialog", "aria-modal": "true", "aria-label": "Escolher álbum", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "modal-head" },
        h("div", null,
          h("p", null, "Catálogo local"),
          h("h2", null, "Escolher álbum")
        ),
        h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
      ),
      h("div", { className: "modal-search" },
        h(Search, { size: 18 }),
        h("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Buscar por álbum, artista, ano, gênero..." })
      ),
      h("div", { className: "modal-album-grid" },
        filtered.length
          ? filtered.map((item) => h("article", {
              className: `modal-album-card ${selectedId === item.id ? "active" : ""}`,
              key: item.id
            },
              item.coverUrl ? h("img", { src: item.coverUrl, alt: "" }) : h("div", { className: "modal-cover-fallback" }, h(Disc3, { size: 24 })),
              h("span", null,
                h("strong", null, item.album),
                h("em", null, `${item.artist || "Artista não informado"} · ${item.releaseYear || "s/ ano"} · ${item.tracks || 0} faixas`)
              ),
              h("div", { className: "modal-album-actions" },
                h("button", {
                  className: "modal-album-action view",
                  type: "button",
                  title: "Visualizar album",
                  "aria-label": `Visualizar ${item.album}`,
                  onClick: () => setPreviewAlbum(item)
                }, h(Eye, { size: 15 })),
                h("button", {
                  className: "modal-album-action add",
                  type: "button",
                  title: "Adicionar album",
                  "aria-label": `Adicionar ${item.album}`,
                  onClick: () => onSelect(item)
                }, h(Plus, { size: 15 }))
              )
            ))
          : h(EmptyState, { text: "Nenhum álbum encontrado no catálogo." })
      ),
      previewAlbum ? h(CatalogAlbumPreviewModal, {
        album: previewAlbum,
        onClose: () => setPreviewAlbum(null),
        onAdd: () => onSelect(previewAlbum)
      }) : null
    )
  );
}

function CatalogAlbumPreviewModal({ album, onClose, onAdd }) {
  useEscapeToClose(onClose);
  const details = [
    [Headphones, "Artista", album.artist || "Artista n\u00e3o informado"],
    [Calendar, "Lan\u00e7amento", displayReleaseDate(album.releaseDate) || album.releaseYear || "Sem data"],
    [Clock, "D\u00e9cada", album.decade || "Sem d\u00e9cada"],
    [Music2, "G\u00eanero", album.genre || "Sem classifica\u00e7\u00e3o"],
    [Disc3, "Subg\u00eanero", album.subgenre || "Sem subg\u00eanero"],
    [Library, "Faixas", album.tracks ? `${album.tracks} faixas` : "Sem faixas"],
    [Clock, "Dura\u00e7\u00e3o", album.durationMin ? `${album.durationMin} min` : "Sem dura\u00e7\u00e3o"]
  ];

  return h("div", {
    className: "modal-backdrop picker-preview-backdrop",
    role: "presentation",
    onMouseDown: (event) => {
      event.stopPropagation();
      onClose();
    }
  },
    h("section", {
      className: "catalog-modal album-preview-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": `Visualizar ${album.album}`,
      onMouseDown: (event) => event.stopPropagation()
    },
      h("div", { className: "modal-head" },
        h("div", null,
          h("p", null, "Cat\u00e1logo local"),
          h("h2", null, album.album || "\u00c1lbum")
        ),
        h("button", { className: "ghost-btn small", type: "button", onClick: onClose }, "Fechar")
      ),
      h("div", { className: "album-preview-layout" },
        album.coverUrl
          ? h("img", { className: "album-preview-cover", src: album.coverUrl, alt: "" })
          : h("div", { className: "album-preview-cover fallback" }, h(Disc3, { size: 42 })),
        h("div", { className: "album-preview-content" },
          h("p", { className: "album-preview-artist" }, album.artist || "Artista n\u00e3o informado"),
          h("div", { className: "album-preview-details" },
            details.map(([Icon, label, value]) => h("div", { className: "album-preview-detail", key: label },
              h("span", null, h(Icon, { size: 14 }), label),
              h("strong", null, value)
            ))
          ),
          h("div", { className: "album-preview-actions" },
            h("button", { className: "primary-btn", type: "button", onClick: onAdd }, h(Plus, { size: 16 }), "Adicionar"),
            album.spotifyUrl ? h("a", { className: "ghost-link", href: album.spotifyUrl, target: "_blank", rel: "noreferrer" }, "Abrir no Spotify") : null
          )
        )
      )
    )
  );
}

function LogTable({ log, catalog, reload, notify }) {
  const [filter, setFilter] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const rows = log.filter((item) => [item.album, item.artist, item.genre, item.format].join(" ").toLowerCase().includes(filter.toLowerCase()));

  async function remove(id) {
    await api(`/api/log/${encodeURIComponent(id)}`, { method: "DELETE" });
    notify("Audição excluída.");
    await reload();
  }

  return h("section", { className: "panel" },
    h("div", { className: "panel-title" },
      h("div", null, h("p", null, "Histórico"), h("h2", null, "Audições cadastradas")),
      h("input", { className: "compact-input", value: filter, onChange: (e) => setFilter(e.target.value), placeholder: "Filtrar registro" })
    ),
    rows.length ? h("div", { className: "table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null, ["Data", "Álbum", "Artista", "Formato", "Nota", "Min", "Ações"].map((cell) => h("th", { key: cell }, cell)))),
        h("tbody", null, rows.map((item) => h("tr", { key: item.id },
          h("td", null, formatDate(item.date)),
          h("td", null, item.album),
          h("td", null, item.artist),
          h("td", null, item.format || "—"),
          h("td", null, item.rating ? formatNumber(normalizeRatingToFive(item.rating)) : "—"),
          h("td", null, item.durationMin || "—"),
          h("td", null,
            h("div", { className: "log-actions" },
              h("button", { className: "icon-btn view", onClick: () => setSelectedLog(item), title: "Visualizar audição", "aria-label": "Visualizar audição" }, h(Eye, { size: 16 })),
              h("button", { className: "icon-btn danger", onClick: () => remove(item.id), title: "Excluir", "aria-label": "Excluir audição" }, h(Trash2, { size: 16 }))
            )
          )
        )))
      )
    ) : h(EmptyState, { text: "Sem dados cadastrados ainda." }),
    selectedLog ? h(LogDetailModal, { item: selectedLog, album: albumForLog(selectedLog, catalog), onClose: () => setSelectedLog(null) }) : null
  );
}

function LogDetailModal({ item, album, onClose }) {
  useEscapeToClose(onClose);
  const details = [
    [Calendar, "Data", formatDate(item.date)],
    [Disc3, "Ano do álbum", item.releaseYear || ""],
    [Clock, "Década", item.decade],
    [Music2, "Gênero", item.genre],
    [Music2, "Subgênero", item.subgenre],
    [Disc3, "Formato", item.format],
    [Headphones, "Plataforma/Mídia", item.platform],
    [Headphones, "Tipo de audição", item.listeningType],
    [Music2, "Faixas ouvidas", item.tracksHeard],
    [Clock, "Duração", item.durationMin ? `${item.durationMin} min` : ""],
    [Star, "Nota", item.rating ? formatNumber(normalizeRatingToFive(item.rating)) : ""],
    [Sparkles, "Humor", item.mood],
    [MapPin, "Local", item.location],
    [Headphones, "Companhia", item.company],
    [Star, "Favorito?", item.favorite],
    [RefreshCw, "Reouvir?", item.listenAgain],
    [Calendar, "Mês", formatMonth(item.month)],
    [Calendar, "Ano da audição", item.listeningYear],
    [Flag, "Semana", item.week]
  ];
  const coverUrl = album?.coverUrl || item.coverUrl || "";

  return h("div", { className: "modal-backdrop", role: "presentation", onMouseDown: onClose },
    h("section", { className: "catalog-modal log-detail-modal", role: "dialog", "aria-modal": "true", "aria-label": "Detalhes da audição", onMouseDown: (event) => event.stopPropagation() },
      h("div", { className: "log-detail-hero" },
        h("div", { className: "log-cover-wrap" },
          coverUrl
            ? h("img", { className: "log-cover", src: coverUrl, alt: "" })
            : h("div", { className: "log-cover log-cover-fallback" }, h(Disc3, { size: 48 }))
        ),
        h("div", { className: "log-hero-copy" },
          h("p", null, "Audição cadastrada"),
          h("h2", null, item.album || "Detalhes da audição"),
          h("span", null, item.artist || "Artista não informado"),
          h("div", { className: "log-hero-meta" },
            h("span", null, h(Calendar, { size: 14 }), formatDate(item.date) || "Sem data"),
            h("span", null, h(Star, { size: 14 }), item.rating ? `${formatNumber(normalizeRatingToFive(item.rating))} / 5` : "Sem nota"),
            h("span", null, h(Clock, { size: 14 }), item.durationMin ? `${item.durationMin} min` : "Sem duração")
          )
        ),
        h("button", { className: "ghost-btn small log-close", type: "button", onClick: onClose }, "Fechar")
      ),
      h("div", { className: "log-detail-grid" },
        details.map(([Icon, label, value]) => h("div", { className: "detail-item", key: label },
          h("span", null, h(Icon, { size: 14 }), label),
          h("strong", null, value || "—")
        )),
        h("div", { className: "detail-item detail-notes" },
          h("span", null, h(BookOpen, { size: 14 }), "Observações"),
          h("strong", null, item.observations || "—")
        )
      )
    )
  );
}

function DiaryView({ db }) {
  const [selectedLog, setSelectedLog] = useState(null);
  const groupedRows = useMemo(() => {
    const sorted = [...db.listeningLog].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return sorted.map((item, index) => {
      const previous = sorted[index - 1];
      const monthKey = String(item.date || "").slice(0, 7);
      const previousMonthKey = String(previous?.date || "").slice(0, 7);
      return {
        item,
        album: albumForLog(item, db.catalog),
        monthKey,
        showMonth: monthKey && monthKey !== previousMonthKey
      };
    });
  }, [db.listeningLog, db.catalog]);

  return h("div", { className: "screen-grid" },
    h("section", { className: "panel diary-panel" },
      h("div", { className: "diary-head" },
        h("div", null,
          h("p", null, "Diário"),
          h("h2", null, "Calendário de audições")
        ),
        h("div", { className: "diary-count" },
          h(Calendar, { size: 16 }),
          h("span", null, `${db.listeningLog.length} ${db.listeningLog.length === 1 ? "audição" : "audições"}`)
        )
      ),
      groupedRows.length ? h("div", { className: "diary-list" },
        h("div", { className: "diary-table-head" },
          h("span", null, "Mês"),
          h("span", null, "Dia"),
          h("span", null, "Capa"),
          h("span", null, "Álbum"),
          h("span", null, "Lançamento"),
          h("span", null, "Nota"),
          h("span", null, "Favorito"),
          h("span", null, "Detalhes")
        ),
        groupedRows.map(({ item, album, monthKey, showMonth }) => h("button", {
          className: "diary-row",
          key: item.id,
          type: "button",
          onClick: () => setSelectedLog(item)
        },
          h("span", { className: "diary-month-cell" },
            showMonth ? h("span", { className: "diary-month-badge" },
              h("strong", null, diaryMonth(monthKey)),
              h("em", null, diaryYear(monthKey))
            ) : null
          ),
          h("span", { className: "diary-day" }, diaryDay(item.date)),
          album?.coverUrl
            ? h("img", { className: "diary-cover", src: album.coverUrl, alt: "" })
            : h("span", { className: "diary-cover diary-cover-fallback" }, h(Disc3, { size: 20 })),
          h("span", { className: "diary-title" },
            h("strong", null, item.album || "Álbum não informado"),
            h("em", null, [item.artist, item.genre, item.format].filter(Boolean).join(" · ") || "Sem detalhes")
          ),
          h("span", { className: "diary-release" }, item.releaseYear || album?.releaseYear || "—"),
          h("span", { className: "diary-rating", "aria-label": item.rating ? `Nota ${formatNumber(normalizeRatingToFive(item.rating))}` : "Sem nota" }, ratingStarsDisplay(item.rating)),
          h("span", { className: `diary-favorite ${item.favorite === "Sim" ? "active" : ""}` }, item.favorite === "Sim" ? "♥" : "—"),
          h("span", { className: "diary-actions" }, h(Eye, { size: 16 }), "Ver")
        ))
      ) : h(EmptyState, { text: "Nenhuma audição cadastrada no diário ainda." })
    ),
    selectedLog ? h(LogDetailModal, { item: selectedLog, album: albumForLog(selectedLog, db.catalog), onClose: () => setSelectedLog(null) }) : null
  );
}

function DashboardView({ db, theme }) {
  const metrics = getMetrics(db.listeningLog);
  return h("div", { className: "screen-grid" },
    h("section", { className: "kpi-grid" },
      h(Kpi, { label: "Total de audições", value: metrics.totalListenings, tone: "teal" }),
      h(Kpi, { label: "Discos únicos", value: metrics.uniqueAlbums, tone: "blue" }),
      h(Kpi, { label: "Artistas únicos", value: metrics.uniqueArtists, tone: "gold" }),
      h(Kpi, { label: "Horas ouvidas", value: formatNumber(metrics.hours), tone: "red" }),
      h(Kpi, { label: "Nota média", value: formatNumber(metrics.avgRating), tone: "teal" }),
      h(Kpi, { label: "Favoritos", value: metrics.favorites, tone: "blue" })
    ),
    h("section", { className: "dashboard-grid" },
      h(ChartPanel, { title: "Audições por gênero", rows: groupMetric(db.listeningLog, "genre"), metric: "count", valueLabel: "audições", type: "doughnut", theme }),
      h(ChartPanel, { title: "Horas por década", rows: groupMetric(db.listeningLog, "decade"), metric: "hours", valueLabel: "horas", type: "doughnut", theme }),
      h(ChartPanel, { title: "Resumo mensal", rows: groupMetric(db.listeningLog, "month", { monthLabels: true }), metric: "count", valueLabel: "audições", type: "bar", theme }),
      h(TopAlbumsPanel, { rows: topAlbums(db.listeningLog), theme })
    ),
    h("section", { className: "summary-grid" },
      h(SummaryTable, { title: "Resumo por Artista", rows: groupMetric(db.listeningLog, "artist") }),
      h(SummaryTable, { title: "Resumo por Gênero", rows: groupMetric(db.listeningLog, "genre") }),
      h(SummaryTable, { title: "Resumo por formato", rows: groupMetric(db.listeningLog, "format") }),
      h(SummaryTable, { title: "Resumo por Década", rows: groupMetric(db.listeningLog, "decade") }),
      h(SummaryTable, { title: "Resumo mensal", rows: groupMetric(db.listeningLog, "month", { monthLabels: true }) }),
      h(SummaryTable, { title: "Top álbuns por nota", rows: topAlbums(db.listeningLog), topAlbums: true })
    )
  );
}

function Kpi({ label, value, tone }) {
  return h("article", { className: `kpi ${tone}` },
    h("span", null, label),
    h("strong", null, value)
  );
}

function ChartPanel({ title, rows, metric, valueLabel, type, theme }) {
  const visibleRows = rows.filter((row) => Number(row[metric] || 0) > 0).slice(0, 8);
  if (!visibleRows.length) {
    return h("div", { className: "panel" },
      h("div", { className: "panel-title compact" }, h("h2", null, title)),
      h(EmptyState, { text: "Sem dados cadastrados ainda." })
    );
  }

  const labels = visibleRows.map((row) => row.label);
  const values = visibleRows.map((row) => Number(row[metric] || 0));
  return h("div", { className: "panel chart-panel" },
    h("div", { className: "panel-title compact" }, h("h2", null, title)),
    h(ChartCanvas, { type, labels, values, label: valueLabel, metric, theme })
  );
}

function TopAlbumsPanel({ rows, theme }) {
  const visibleRows = rows.slice(0, 8).filter((row) => Number(row.rating || 0) > 0);
  return h("div", { className: "panel" },
    h("div", { className: "panel-title compact" }, h("h2", null, "Top álbuns")),
    visibleRows.length
      ? h(ChartCanvas, {
        type: "bar",
        labels: visibleRows.map((item) => item.album),
        values: visibleRows.map((item) => normalizeRatingToFive(item.rating)),
        label: "nota",
        metric: "rating",
        horizontal: true,
        maxValue: 10,
        theme
      })
      : h(EmptyState, { text: "Sem dados cadastrados ainda." })
  );
}

function ChartCanvas({ type, labels, values, label, metric, horizontal = false, maxValue, theme }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue("--ink").trim();
    const muted = styles.getPropertyValue("--muted").trim();
    const line = styles.getPropertyValue("--line").trim();
    const surface = styles.getPropertyValue("--surface").trim();
    const green = styles.getPropertyValue("--green").trim();
    const palette = chartPalette(theme);
    const isDoughnut = type === "doughnut";
    const numberScale = {
      beginAtZero: true,
      max: maxValue,
      grid: {
        color: line,
        drawBorder: false
      },
      ticks: {
        color: muted,
        precision: 0,
        font: { size: 11, weight: "700" },
        callback: (value) => metric === "hours" ? formatNumber(value) : value
      }
    };
    const categoryScale = {
      grid: {
        display: false,
        drawBorder: false
      },
      ticks: {
        color: ink,
        font: { size: 11, weight: "700" },
        callback: function callback(value) {
          const text = this.getLabelForValue(value);
          return truncateLabel(text, horizontal ? 22 : 12);
        }
      }
    };
    const context = canvasRef.current.getContext("2d");
    const chart = new Chart(context, {
      type,
      data: {
        labels,
        datasets: [{
          label,
          data: values,
          backgroundColor: isDoughnut ? palette : green,
          borderColor: isDoughnut ? surface : green,
          borderWidth: isDoughnut ? 3 : 0,
          borderRadius: isDoughnut ? 0 : 10,
          borderSkipped: false,
          hoverOffset: isDoughnut ? 8 : 0,
          maxBarThickness: horizontal ? 18 : 34
        }]
      },
      options: {
        indexAxis: horizontal ? "y" : "x",
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 650,
          easing: "easeOutQuart"
        },
        cutout: isDoughnut ? "62%" : undefined,
        plugins: {
          legend: {
            display: isDoughnut,
            position: "bottom",
            labels: {
              color: muted,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: "circle",
              padding: 14,
              font: { size: 12, weight: "700" }
            }
          },
          tooltip: {
            backgroundColor: theme === "dark" ? "#091820" : "#243041",
            titleColor: "#ffffff",
            bodyColor: "#ffffff",
            displayColors: true,
            padding: 12,
            cornerRadius: 12,
            callbacks: {
              label: (context) => {
                const value = Number(context.raw || 0);
                if (metric === "hours") return `${label}: ${formatNumber(value)}h`;
                if (metric === "rating") return `${label}: ${formatNumber(value)}`;
                return `${label}: ${value}`;
              }
            }
          }
        },
        scales: isDoughnut ? undefined : horizontal
          ? { x: numberScale, y: categoryScale }
          : { x: categoryScale, y: numberScale }
      }
    });

    return () => chart.destroy();
  }, [type, labels.join("|"), values.join("|"), label, metric, horizontal, maxValue, theme]);

  return h("div", { className: `chart-shell ${type === "doughnut" ? "doughnut" : "bar-chart"}` },
    h("canvas", { ref: canvasRef, "aria-label": label, role: "img" })
  );
}

function chartPalette(theme) {
  return theme === "dark"
    ? ["#FF9F43", "#1FD17C", "#4CC9F0", "#FFC875", "#2FE39A", "#7BDFF8", "#FFB15F", "#8AF0C0"]
    : ["#1581BF", "#3DB6B1", "#CCE5CF", "#7FC8A9", "#126FA5", "#33A39F", "#A9D8AF", "#6FAFCF"];
}

function truncateLabel(value, maxLength) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function SummaryTable({ title, rows, topAlbums: isTopAlbums }) {
  return h("div", { className: "panel" },
    h("div", { className: "panel-title compact" }, h("h2", null, title)),
    rows.length ? h("div", { className: "table-wrap" },
      h("table", null,
        h("thead", null, h("tr", null,
          isTopAlbums
            ? ["Álbum", "Artista", "Nota", "Data"].map((cell) => h("th", { key: cell }, cell))
            : ["Item", "Qtd", "Horas", "Nota média"].map((cell) => h("th", { key: cell }, cell))
        )),
        h("tbody", null, rows.slice(0, 12).map((row) => h("tr", { key: row.label || `${row.album}-${row.date}` },
          isTopAlbums
            ? [h("td", { key: "a" }, row.album), h("td", { key: "b" }, row.artist), h("td", { key: "c" }, formatNumber(row.rating)), h("td", { key: "d" }, formatDate(row.date))]
            : [h("td", { key: "a" }, row.label), h("td", { key: "b" }, row.count), h("td", { key: "c" }, formatNumber(row.hours)), h("td", { key: "d" }, formatNumber(row.avgRating))]
        )))
      )
    ) : h(EmptyState, { text: "Sem dados cadastrados ainda." })
  );
}

function AdminUsersView({ notify, currentUser }) {
  const emptyForm = { name: "", email: "", password: "", role: "user", status: "active", approvalStatus: "approved", phone: "", whatsapp: "", bio: "" };
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api("/api/users");
      setUsers(data.users || []);
    } catch (error) {
      notify(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function editUser(user) {
    setEditingId(user.id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      role: user.role || "user",
      status: user.status || "active",
      approvalStatus: user.approvalStatus || "approved",
      phone: user.phone || "",
      whatsapp: user.whatsapp || "",
      bio: user.bio || ""
    });
  }

  function resetForm() {
    setEditingId("");
    setForm(emptyForm);
  }

  async function saveUser(event) {
    event.preventDefault();
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    try {
      const data = editingId
        ? await api(`/api/users/${encodeURIComponent(editingId)}`, { method: "PUT", body: payload })
        : await api("/api/users", { method: "POST", body: form });
      setUsers(data.users || []);
      notify(editingId ? "Usuário atualizado." : "Usuário criado.");
      resetForm();
    } catch (error) {
      notify(error.message);
    }
  }

  async function changeStatus(user, status) {
    try {
      const data = await api(`/api/users/${encodeURIComponent(user.id)}/status`, { method: "PATCH", body: { status } });
      setUsers(data.users || []);
      notify(status === "active" ? "Usuário ativado." : "Usuário desativado.");
    } catch (error) {
      notify(error.message);
    }
  }

  async function deleteUser(user) {
    if (!confirm(`Excluir ${user.name}? Se houver histórico vinculado, ele será apenas desativado.`)) return;
    try {
      const data = await api(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      setUsers(data.users || []);
      notify(data.warning || "Usuário excluído.");
    } catch (error) {
      notify(error.message);
    }
  }

  return h("div", { className: "screen-grid" },
    h("section", { className: "panel" },
      h("div", { className: "panel-title" },
        h("div", null, h("p", null, "Administração"), h("h2", null, editingId ? "Editar usuário" : "Cadastrar usuário")),
        editingId ? h("button", { className: "ghost-btn", type: "button", onClick: resetForm }, "Novo usuário") : null
      ),
      h("form", { className: "form-grid admin-user-form", onSubmit: saveUser },
        h(AdminInput, { label: "Nome", value: form.name, onChange: (value) => updateField("name", value), required: true }),
        h(AdminInput, { label: "Email", type: "email", value: form.email, onChange: (value) => updateField("email", value), required: true }),
        h(AdminInput, { label: editingId ? "Nova senha" : "Senha", type: "password", value: form.password, onChange: (value) => updateField("password", value), required: !editingId }),
        h(AdminSelect, { label: "Perfil", value: form.role, onChange: (value) => updateField("role", value), options: [["user", "Usuário"], ["admin", "Administrador"]] }),
        h(AdminSelect, { label: "Status", value: form.status, onChange: (value) => updateField("status", value), options: [["active", "Ativo"], ["inactive", "Inativo"]] }),
        h(AdminSelect, { label: "Aprovacao", value: form.approvalStatus, onChange: (value) => updateField("approvalStatus", value), options: [["approved", "Aprovado"], ["pending", "Pendente"], ["rejected", "Recusado"]] }),
        h(AdminInput, { label: "Celular", value: form.phone, onChange: (value) => updateField("phone", value), icon: Phone }),
        h(AdminInput, { label: "WhatsApp", value: form.whatsapp, onChange: (value) => updateField("whatsapp", value), icon: Phone }),
        h("label", { className: "field full" },
          h("span", null, "Bio"),
          h("textarea", { value: form.bio, onChange: (event) => updateField("bio", event.target.value), rows: 3 })
        ),
        h("div", { className: "form-actions full" },
          h("button", { className: "primary-btn", type: "submit" }, h(Check, { size: 16 }), editingId ? "Salvar usuário" : "Criar usuário")
        )
      )
    ),
    h("section", { className: "panel" },
      h("div", { className: "panel-title" },
        h("div", null, h("p", null, "Controle de acesso"), h("h2", null, "Usuários cadastrados")),
        h("button", { className: "ghost-btn", onClick: loadUsers }, h(RefreshCw, { size: 16 }), "Atualizar")
      ),
      loading
        ? h("div", { className: "empty-state" }, "Carregando usuários.")
        : h("div", { className: "table-wrap" },
          h("table", { className: "admin-users-table" },
            h("thead", null, h("tr", null,
              ["Nome", "Email", "Perfil", "Aprovacao", "Status", "Contato", "Ultimo login", "Acoes"].map((cell) => h("th", { key: cell }, cell))
            )),
            h("tbody", null, users.map((user) => h("tr", { key: user.id },
              h("td", null, h("strong", null, user.name)),
              h("td", null, user.email),
              h("td", null, user.role === "admin" ? "Administrador" : "Usuário"),
              h("td", null, h("span", { className: `status-pill ${user.approvalStatus || "approved"}` }, approvalStatusLabel(user.approvalStatus))),
              h("td", null, h("span", { className: `status-pill ${user.status}` }, user.status === "active" ? "Ativo" : "Inativo")),
              h("td", null, user.phone || user.whatsapp ? [user.phone, user.whatsapp].filter(Boolean).join(" / ") : "—"),
              h("td", null, user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"),
              h("td", null,
                h("div", { className: "row-actions" },
                  h("button", { className: "ghost-btn", onClick: () => editUser(user) }, "Editar"),
                  user.approvalStatus === "pending"
                    ? h("button", { className: "primary-btn small", onClick: () => changeStatus(user, "active") }, "Aceitar")
                    : null,
                  user.status === "active"
                    ? h("button", { className: "danger-btn", disabled: user.id === currentUser.id, onClick: () => changeStatus(user, "inactive") }, "Desativar")
                    : h("button", { className: "ghost-btn", onClick: () => changeStatus(user, "active") }, "Ativar"),
                  h("button", { className: "danger-btn", disabled: user.id === currentUser.id, onClick: () => deleteUser(user) }, "Excluir")
                )
              )
            )))
          )
        )
    )
  );
}

function AdminInput({ label, value, onChange, type = "text", required = false, icon: Icon }) {
  return h("label", { className: "field" },
    h("span", null, Icon ? h(Icon, { size: 14 }) : null, label),
    h("input", { type, value, required, onChange: (event) => onChange(event.target.value) })
  );
}

function AdminSelect({ label, value, onChange, options }) {
  return h("label", { className: "field" },
    h("span", null, label),
    h("select", { value, onChange: (event) => onChange(event.target.value) },
      options.map(([optionValue, optionLabel]) => h("option", { key: optionValue, value: optionValue }, optionLabel))
    )
  );
}

function SettingsView({ db, reload, notify }) {
  const [lists, setLists] = useState(() => ({ ...db.lists }));

  async function save() {
    await api("/api/lists", { method: "PUT", body: lists });
    notify("Configurações salvas.");
    await reload();
  }

  return h("section", { className: "panel" },
    h("div", { className: "panel-title" },
      h("div", null, h("p", null, "Opções do sistema"), h("h2", null, "Listas auxiliares")),
      h("button", { className: "primary-btn", onClick: save }, h(Check, { size: 16 }), "Salvar configurações")
    ),
    h("div", { className: "lists-grid" },
      Object.entries(listLabels).map(([key, label]) => h("label", { className: "list-editor", key },
        h("span", null, label),
        h("textarea", {
          value: (lists[key] || []).join("\n"),
          onChange: (event) => setLists({ ...lists, [key]: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })
        })
      ))
    )
  );
}

function ProfileView({ user, db, setUser, notify, profileUserId, openPublicProfile, openBubble, onPodcastPlaybackChange }) {
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publicProfile, setPublicProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [profileTab, setProfileTab] = useState("overview");
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);
  const [editingPodcast, setEditingPodcast] = useState(null);
  const isOwnProfile = !profileUserId || profileUserId === user?.id;
  const viewedUser = isOwnProfile ? user : publicProfile?.user;
  const viewedDb = isOwnProfile ? db : publicProfile?.db;
  const profileBubbles = publicProfile?.bubbles || { owned: [], member: [] };
  const profileArticles = publicProfile?.articles || [];
  const profilePodcasts = publicProfile?.podcasts || [];
  const logs = useMemo(() => [...(viewedDb?.listeningLog || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [viewedDb?.listeningLog]);
  const metrics = useMemo(() => getMetrics(logs), [logs]);
  const recentActivity = logs.slice(0, 8);
  const favoriteAlbums = logs.filter((item) => item.favorite === "Sim").slice(0, 5);
  const recentReviews = logs.filter((item) => String(item.observations || "").trim()).slice(0, 4);
  const topGenres = groupMetric(logs, "genre").slice(0, 4);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setAvatarUrl(user?.avatarUrl || "");
    setBio(user?.bio || "");
    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
  }, [user?.id, user?.name, user?.email, user?.avatarUrl, user?.bio]);

  useEffect(() => {
    const targetProfileId = profileUserId || user?.id;
    if (!targetProfileId) return;
    setSettingsOpen(false);
    setProfileLoading(!isOwnProfile);
    api(`/api/profiles/${encodeURIComponent(targetProfileId)}`)
      .then((data) => setPublicProfile(data.profile))
      .catch((error) => notify(error.message))
      .finally(() => setProfileLoading(false));
  }, [profileUserId, user?.id, isOwnProfile, profileRefreshKey]);

  useEffect(() => {
    setProfileTab("overview");
  }, [profileUserId, user?.id]);

  async function requestProfileBubbleJoin(bubble) {
    try {
      await api(`/api/bubbles/${encodeURIComponent(bubble.id)}/join`, { method: "POST", body: {} });
      notify("Solicitacao enviada.");
      setProfileRefreshKey((value) => value + 1);
    } catch (error) {
      notify(error.message);
    }
  }

  function viewProfileArticle(article) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedArticle(article), 180);
  }

  function viewProfilePodcast(episode) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setSelectedPodcast(episode), 180);
  }

  function openProfileArticleEditor(article = { status: "draft" }) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.setTimeout(() => setEditingArticle(article), 40);
  }

  function openProfilePodcastEditor(episode = { status: "draft" }) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.setTimeout(() => setEditingPodcast(episode), 40);
  }

  async function saveProfileArticle(payload, id = "") {
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/profile/articles/${encodeURIComponent(id)}` : "/api/profile/articles";
    const data = await api(url, { method, body: payload });
    setPublicProfile((profile) => profile ? { ...profile, articles: data.articles || [] } : profile);
    setEditingArticle(null);
    setProfileRefreshKey((value) => value + 1);
    notify(payload.status === "published" ? "Artigo publicado no seu perfil." : "Artigo salvo no seu perfil.");
  }

  async function saveProfilePodcast(payload, id = "") {
    const method = id ? "PUT" : "POST";
    const url = id ? `/api/profile/podcasts/${encodeURIComponent(id)}` : "/api/profile/podcasts";
    const data = await api(url, { method, body: payload });
    setPublicProfile((profile) => profile ? { ...profile, podcasts: data.episodes || [] } : profile);
    setEditingPodcast(null);
    setProfileRefreshKey((value) => value + 1);
    notify(payload.status === "published" ? "Podcast publicado no seu perfil." : "Podcast salvo no seu perfil.");
  }

  async function deleteProfileArticle(article) {
    if (!window.confirm(`Excluir o artigo "${article.title}"?`)) return;
    const data = await api(`/api/profile/articles/${encodeURIComponent(article.id)}`, { method: "DELETE" });
    setPublicProfile((profile) => profile ? { ...profile, articles: data.articles || [] } : profile);
    setProfileRefreshKey((value) => value + 1);
    notify("Artigo excluido do perfil.");
  }

  async function deleteProfilePodcast(episode) {
    if (!window.confirm(`Excluir o podcast "${episode.title}"?`)) return;
    const data = await api(`/api/profile/podcasts/${encodeURIComponent(episode.id)}`, { method: "DELETE" });
    setPublicProfile((profile) => profile ? { ...profile, podcasts: data.episodes || [] } : profile);
    setProfileRefreshKey((value) => value + 1);
    notify("Podcast excluido do perfil.");
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api("/api/profile", {
        method: "PUT",
        body: { name, email, avatarUrl, bio, currentPassword, password, confirmPassword }
      });
      setUser(data.user);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      notify("Perfil atualizado.");
    } catch (error) {
      notify(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isOwnProfile && profileLoading) {
    return h("div", { className: "boot inline" },
      h(Loader2, { className: "spin", size: 24 }),
      h("strong", null, "Carregando perfil publico")
    );
  }

  if (!isOwnProfile && !viewedUser) {
    return h(EmptyState, { text: "Perfil publico nao encontrado." });
  }

  return h("div", { className: "profile-public-screen" },
    h("section", { className: "profile-public-hero" },
      h("div", { className: "profile-public-main" },
        h(SafeImage, {
          src: isOwnProfile ? avatarUrl : viewedUser?.avatarUrl,
          className: "profile-public-avatar",
          fallbackClassName: "profile-public-avatar profile-avatar-fallback",
          fallbackIcon: (viewedUser?.name || name || "U").slice(0, 1).toUpperCase()
        }),
        h("div", { className: "profile-public-copy" },
          h("p", null, viewedUser?.role === "admin" ? "Administrador da comunidade" : "Membro da comunidade"),
          h("h2", null, viewedUser?.name || name || "Perfil"),
          h("span", null, viewedUser?.bio || bio || "Este usuario ainda nao escreveu uma bio."),
          h("div", { className: "profile-public-tags" },
            topGenres.length
              ? topGenres.map((genre) => h("em", { key: genre.label }, genre.label))
              : h("em", null, "Explorando discos")
          )
        )
      ),
      isOwnProfile ? h("div", { className: "profile-public-actions" },
        h("button", { className: "ghost-btn", type: "button", onClick: () => setSettingsOpen(!settingsOpen) },
          h(Settings, { size: 16 }),
          settingsOpen ? "Fechar configurações" : "Configurações"
        )
      ) : null,
      h("div", { className: "profile-public-stats" },
        h(ProfileStat, { value: metrics.totalListenings, label: "audições" }),
        h(ProfileStat, { value: metrics.uniqueAlbums, label: "álbuns" }),
        h(ProfileStat, { value: metrics.uniqueArtists, label: "artistas" }),
        h(ProfileStat, { value: formatNumber(metrics.avgRating), label: "nota média" })
      )
    ),
    isOwnProfile && settingsOpen ? h("form", { className: "panel profile-form", onSubmit: submit, autoComplete: "off" },
      h("div", { className: "panel-title" },
        h("div", null,
          h("p", null, "Visível apenas para você"),
          h("h2", null, "Configurações do perfil")
        ),
        h("button", { className: "primary-btn", type: "submit", disabled: saving },
          saving ? h(Loader2, { className: "spin", size: 16 }) : h(Check, { size: 16 }),
          saving ? "Salvando" : "Salvar perfil"
        )
      ),
      h("div", { className: "profile-grid" },
        h("label", { className: "field" },
          h("span", null, h(Users, { size: 14 }), "Nick name"),
          h("input", { value: name, onChange: (event) => setName(event.target.value), maxLength: 80, required: true })
        ),
        h("label", { className: "field" },
          h("span", null, h(Mail, { size: 14 }), "Email"),
          h("input", { type: "email", value: email, onChange: (event) => setEmail(event.target.value), required: true })
        ),
        h("label", { className: "field full" },
          h("span", null, h(Image, { size: 14 }), "URL da foto de perfil"),
          h("input", { value: avatarUrl, onChange: (event) => setAvatarUrl(event.target.value), placeholder: "https://..." })
        ),
        h("label", { className: "field full" },
          h("span", null, h(BookOpen, { size: 14 }), "Bio pública"),
          h("textarea", { value: bio, onChange: (event) => setBio(event.target.value), maxLength: 500, rows: 5, placeholder: "Conte um pouco sobre seu gosto musical, discos favoritos, cenas que acompanha..." })
        )
      ),
      h("div", { className: "profile-password-box" },
        h("div", null,
          h("p", null, "Segurança"),
          h("h3", null, "Alterar senha")
        ),
        h("div", { className: "profile-grid" },
          h("label", { className: "field" },
            h("span", null, h(Lock, { size: 14 }), "Senha atual"),
            h("input", { type: "password", value: currentPassword, autoComplete: "current-password", onChange: (event) => setCurrentPassword(event.target.value) })
          ),
          h("label", { className: "field" },
            h("span", null, h(Lock, { size: 14 }), "Nova senha"),
            h("input", { type: "password", value: password, autoComplete: "new-password", onChange: (event) => setPassword(event.target.value) })
          ),
          h("label", { className: "field" },
            h("span", null, h(Check, { size: 14 }), "Confirmar nova senha"),
            h("input", { type: "password", value: confirmPassword, autoComplete: "new-password", onChange: (event) => setConfirmPassword(event.target.value) })
          )
        )
      )
    ) : null,
    h("nav", { className: "community-tabs profile-content-tabs", "aria-label": "Areas do perfil" },
      [
        ["overview", "Meus Albums e Bubbles", "Favoritos, reviews e comunidades", Disc3],
        ["articles", "Meus Artigos", "Textos publicados no perfil", BookOpen],
        ["podcasts", "Meus Podcasts", "Episodios publicados no perfil", Headphones]
      ].map(([id, label, description, Icon]) =>
        h("button", {
          key: id,
          type: "button",
          className: profileTab === id ? "active" : "",
          onClick: () => setProfileTab(id)
        },
          h("span", { className: "community-tab-icon" }, h(Icon, { size: 18 })),
          h("span", { className: "community-tab-copy" },
            h("strong", null, label),
            h("small", null, description)
          )
        )
      )
    ),
    h("div", { className: "profile-public-grid" },
      profileTab === "overview" ? h(ProfileBubblesSection, {
        owned: profileBubbles.owned,
        member: profileBubbles.member,
        isOwnProfile,
        onJoin: requestProfileBubbleJoin,
        onOpenBubble: openBubble
      }) : null,
      profileTab === "articles" ? h(ProfileEditorialSection, {
        title: "Meus Artigos",
        subtitle: isOwnProfile ? "Textos publicados no seu perfil" : "Artigos publicados neste perfil",
        items: profileArticles,
        isOwnProfile,
        type: "article",
        onCreate: () => openProfileArticleEditor(),
        onView: viewProfileArticle,
        onEdit: openProfileArticleEditor,
        onDelete: deleteProfileArticle
      }) : null,
      profileTab === "podcasts" ? h(ProfileEditorialSection, {
        title: "Meus Podcasts",
        subtitle: isOwnProfile ? "Episodios publicados no seu perfil" : "Podcasts publicados neste perfil",
        items: profilePodcasts,
        isOwnProfile,
        type: "podcast",
        onCreate: () => openProfilePodcastEditor(),
        onView: viewProfilePodcast,
        onEdit: openProfilePodcastEditor,
        onDelete: deleteProfilePodcast,
        onPodcastPlaybackChange
      }) : null,
      profileTab === "overview" ? h("section", { className: "profile-public-section" },
        h("div", { className: "profile-section-head" },
          h("h3", null, "Álbuns favoritos"),
          h("span", null, `${favoriteAlbums.length} destaques`)
        ),
        favoriteAlbums.length
          ? h("div", { className: "profile-cover-row" }, favoriteAlbums.map((item) => h(ProfileAlbumTile, { key: item.id, item, album: albumForLog(item, viewedDb.catalog) })))
          : h(EmptyState, { text: "Nenhum favorito marcado ainda." })
      ) : null,
      profileTab === "overview" ? h("section", { className: "profile-public-section" },
        h("div", { className: "profile-section-head" },
          h("h3", null, "Atividade recente"),
          h("span", null, `${recentActivity.length} registros`)
        ),
        recentActivity.length
          ? h("div", { className: "profile-activity-grid" }, recentActivity.map((item) => h(ProfileActivityCard, { key: item.id, item, album: albumForLog(item, viewedDb.catalog) })))
          : h(EmptyState, { text: "Nenhuma atividade registrada ainda." })
      ) : null,
      profileTab === "overview" ? h("section", { className: "profile-public-section profile-reviews-section" },
        h("div", { className: "profile-section-head" },
          h("h3", null, "Reviews recentes"),
          h("span", null, `${recentReviews.length} textos`)
        ),
        recentReviews.length
          ? h("div", { className: "profile-review-list" }, recentReviews.map((item) => h(ProfileReviewCard, { key: item.id, item, album: albumForLog(item, viewedDb.catalog), user, openPublicProfile })))
          : h(EmptyState, { text: "Nenhum review escrito ainda. Use observações na audição para publicar aqui." })
      ) : null
    ),
    selectedArticle ? h(ArticleDetailModal, {
      article: selectedArticle,
      onClose: () => setSelectedArticle(null),
      isAdmin: isOwnProfile,
      openPublicProfile,
      onEdit: (article) => {
        setSelectedArticle(null);
        setEditingArticle(article);
      }
    }) : null,
    selectedPodcast ? h(PodcastDetailModal, {
      episode: selectedPodcast,
      onClose: () => setSelectedPodcast(null),
      isAdmin: isOwnProfile,
      openPublicProfile,
      onEdit: (episode) => {
        setSelectedPodcast(null);
        setEditingPodcast(episode);
      },
      onPodcastPlaybackChange
    }) : null,
    editingArticle ? h(ArticleEditorModal, {
      article: editingArticle,
      onClose: () => setEditingArticle(null),
      onSave: saveProfileArticle,
      contextLabel: "Artigo do Perfil"
    }) : null,
    editingPodcast ? h(PodcastEditorModal, {
      episode: editingPodcast,
      onClose: () => setEditingPodcast(null),
      onSave: saveProfilePodcast,
      contextLabel: "Podcast do Perfil"
    }) : null
  );
}

function ProfileStat({ value, label }) {
  return h("div", { className: "profile-stat" },
    h("strong", null, value),
    h("span", null, label)
  );
}

function ProfileEditorialSection({ title, subtitle, items, isOwnProfile, type, onCreate, onView, onEdit, onDelete, onPodcastPlaybackChange }) {
  const Icon = type === "podcast" ? Headphones : BookOpen;
  const isPodcast = type === "podcast";
  const emptyText = type === "podcast"
    ? (isOwnProfile ? "Publique seu primeiro podcast no perfil." : "Nenhum podcast publicado neste perfil ainda.")
    : (isOwnProfile ? "Publique seu primeiro artigo no perfil." : "Nenhum artigo publicado neste perfil ainda.");

  return h("section", { className: `profile-public-section profile-editorial-section ${isPodcast ? "profile-podcast-section" : ""}` },
    h("div", { className: "profile-section-head profile-section-head-actions" },
      h("div", null,
        h("h3", null, title),
        h("span", null, subtitle)
      ),
      isOwnProfile ? h("button", { className: "ghost-btn small", type: "button", onClick: onCreate },
        h(Plus, { size: 14 }),
        type === "podcast" ? "Novo podcast" : "Novo artigo"
      ) : null
    ),
    items.length
      ? h("div", { className: isPodcast ? "profile-podcast-list" : "profile-editorial-grid" },
          items.map((item) => h("article", { className: "profile-editorial-card", key: item.id },
            h(SafeImage, {
              src: item.coverUrl,
              className: "profile-editorial-cover",
              fallbackClassName: "profile-editorial-cover profile-editorial-fallback",
              fallbackIcon: h(Icon, { size: 24 })
            }),
            h("div", { className: "profile-editorial-copy" },
              h("p", null, item.status === "published" ? "Publicado" : item.status === "archived" ? "Arquivado" : "Rascunho"),
              h("h4", null, item.title),
              h("span", null, item.summary || item.description || "Sem resumo informado."),
              isPodcast ? h("em", { className: "profile-podcast-meta" },
                `${item.authorName || "Perfil"} · ${item.publishedAt ? formatDate(item.publishedAt) : formatDate(item.updatedAt)}${item.durationMin ? ` · ${item.durationMin} min` : ""}`
              ) : null,
              h("em", { className: "profile-editorial-comment-count" },
                h(MessageCircle, { size: 13 }),
                `${item.commentsCount || 0} comentario${Number(item.commentsCount || 0) === 1 ? "" : "s"}`
              ),
              isPodcast && item.playbackAudioUrl ? h("div", { className: "profile-podcast-player" },
                h(PodcastInlinePlayer, { episode: item, onPodcastPlaybackChange })
              ) : null,
              h("div", { className: "profile-editorial-actions" },
                h("button", { className: "ghost-btn small", type: "button", onClick: () => onView(item) }, h(Eye, { size: 14 }), type === "podcast" ? "Ouvir" : "Ler"),
                isOwnProfile ? h("button", { className: "ghost-btn small", type: "button", onClick: () => onEdit(item) }, "Editar") : null,
                isOwnProfile ? h("button", { className: "danger-btn small", type: "button", onClick: () => onDelete(item) }, "Excluir") : null
              )
            )
          ))
        )
      : h(EmptyState, { text: emptyText })
  );
}

function ProfileBubblesSection({ owned, member, isOwnProfile, onJoin, onOpenBubble }) {
  const total = (owned?.length || 0) + (member?.length || 0);
  return h("section", { className: "profile-public-section profile-bubbles-section" },
    h("div", { className: "profile-section-head" },
      h("h3", null, "Bubbles"),
      h("span", null, `${total} comunidades`)
    ),
    total
      ? h("div", { className: "profile-bubbles-groups" },
          owned?.length ? h(ProfileBubbleGroup, { title: "Criadas por este usuario", bubbles: owned, isOwnProfile, onJoin, onOpenBubble }) : null,
          member?.length ? h(ProfileBubbleGroup, { title: "Participa como membro", bubbles: member, isOwnProfile, onJoin, onOpenBubble }) : null
        )
      : h(EmptyState, { text: "Nenhuma Bubble publica ou participacao visivel ainda." })
  );
}

function ProfileBubbleGroup({ title, bubbles, isOwnProfile, onJoin, onOpenBubble }) {
  return h("div", { className: "profile-bubble-group" },
    h("h4", null, title),
    h("div", { className: "profile-bubble-grid" },
      bubbles.map((bubble) => h(ProfileBubbleCard, { key: bubble.id, bubble, isOwnProfile, onJoin, onOpenBubble }))
    )
  );
}

function ProfileBubbleCard({ bubble, isOwnProfile, onJoin, onOpenBubble }) {
  const canRequest = !isOwnProfile && !bubble.myStatus && bubble.visibility !== "private";
  const statusLabel = bubble.myStatus
    ? memberStatusLabel(bubble.myStatus)
    : bubble.visibility === "private"
      ? "Convite necessario"
      : "Visitante";
  return h("article", { className: "profile-bubble-card" },
    h("button", { className: "profile-bubble-open", type: "button", onClick: () => onOpenBubble?.(bubble.id) },
      h(SafeImage, {
        src: bubble.coverUrl,
        className: "profile-bubble-cover",
        fallbackClassName: "profile-bubble-cover profile-bubble-fallback",
        fallbackIcon: bubble.name?.slice(0, 2).toUpperCase() || h(Users, { size: 22 })
      }),
      h("div", { className: "profile-bubble-copy" },
        h("span", null, bubbleVisibilityLabel(bubble.visibility)),
        h("strong", null, bubble.name),
        h("p", null, bubble.description || "Comunidade musical no MyAlbums."),
        h("div", { className: "profile-bubble-meta" },
          h("em", null, `${bubble.memberCount || 0} membros`),
          h("em", null, `${bubble.postCount || 0} posts`),
          h("em", null, statusLabel)
        )
      )
    ),
    canRequest ? h("button", { className: "ghost-btn small", type: "button", onClick: () => onJoin(bubble) }, h(Plus, { size: 14 }), "Solicitar entrada") : null
  );
}

function ProfileAlbumTile({ item, album }) {
  const coverUrl = album?.coverUrl || item.coverUrl || "";
  return h("article", { className: "profile-album-tile" },
    h(SafeImage, {
      src: coverUrl,
      className: "profile-cover-thumb",
      fallbackClassName: "profile-cover-thumb profile-cover-fallback",
      fallbackIcon: h(Disc3, { size: 24 })
    }),
    h("strong", null, item.album || "Álbum"),
    h("span", null, item.artist || "Artista")
  );
}

function ProfileActivityCard({ item, album }) {
  const coverUrl = album?.coverUrl || item.coverUrl || "";
  return h("article", { className: "profile-activity-card" },
    h(SafeImage, {
      src: coverUrl,
      className: "profile-activity-cover",
      fallbackClassName: "profile-activity-cover profile-cover-fallback",
      fallbackIcon: h(Disc3, { size: 22 })
    }),
    h("div", null,
      h("strong", null, item.album || "Álbum"),
      h("span", null, `${item.artist || "Artista"} · ${formatDate(item.date) || "sem data"}`),
      h("div", { className: "profile-mini-rating" }, ratingStarsDisplay(item.rating))
    )
  );
}

function ProfileReviewCard({ item, album, user, openPublicProfile }) {
  const coverUrl = album?.coverUrl || item.coverUrl || "";
  return h("article", { className: "profile-review-card" },
    h(SafeImage, {
      src: coverUrl,
      className: "profile-review-cover",
      fallbackClassName: "profile-review-cover profile-cover-fallback",
      fallbackIcon: h(Disc3, { size: 22 })
    }),
    h("div", null,
      h("h4", null, item.album || "Álbum"),
      h("span", null, `${item.artist || "Artista"} · ${formatDate(item.date) || "sem data"}`),
      h("div", { className: "profile-mini-rating" }, ratingStarsDisplay(item.rating)),
      h("p", null, item.observations),
      h(ProfileReviewComments, { reviewId: item.id, isAdmin: user?.role === "admin", openPublicProfile })
    )
  );
}

function ProfileReviewComments({ reviewId, isAdmin, openPublicProfile }) {
  const endpoint = `/api/reviews/${encodeURIComponent(reviewId)}/comments`;
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const total = countComments(comments);

  async function loadComments() {
    setLoading(true);
    try {
      const data = await api(endpoint);
      setComments(data.comments || []);
    } finally {
      setLoading(false);
    }
  }

  async function submitComment(event, parentCommentId = "") {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formData(form);
    if (parentCommentId) payload.parentCommentId = parentCommentId;
    setSending(true);
    try {
      const data = await api(endpoint, { method: "POST", body: payload });
      setComments(data.comments || []);
      form.reset();
    } finally {
      setSending(false);
    }
  }

  async function moderateComment(comment, status) {
    const data = await api(`${endpoint}/${encodeURIComponent(comment.id)}`, { method: "PATCH", body: { status } });
    setComments(data.comments || []);
  }

  useEffect(() => {
    loadComments().catch(() => setLoading(false));
  }, [endpoint]);

  return h("section", { className: "profile-review-comments" },
    h("div", { className: "profile-review-comments-head" },
      h("span", null, h(MessageCircle, { size: 14 }), total ? `${total} comentario${total === 1 ? "" : "s"}` : "Seja o primeiro a comentar")
    ),
    h("form", { className: "bubble-comment-form profile-review-comment-form", onSubmit: submitComment },
      h("input", { name: "content", maxLength: 800, placeholder: "Comente este review...", required: true }),
      h("button", { type: "submit", disabled: sending }, sending ? "Enviando" : "Comentar")
    ),
    loading
      ? h("p", { className: "bubble-no-comments" }, "Carregando comentarios...")
      : comments.length
        ? h("div", { className: "bubble-comment-tree profile-review-comment-tree" },
            comments.map((comment) => h(CommunityComment, {
              key: comment.id,
              comment,
              isAdmin,
              onReply: submitComment,
              onModerate: moderateComment,
              openPublicProfile
            }))
          )
        : null
  );
}

function Field({ label, icon: Icon, children }) {
  return h("label", { className: "field" },
    h("span", null, Icon ? h(Icon, { size: 14 }) : null, label),
    children
  );
}

function InputField({ name, label, icon, type = "text", defaultValue = "", min, max, step }) {
  return h(Field, { label, icon }, h("input", { name, type, defaultValue, min, max, step }));
}

function RatingField({ name, label, icon: Icon }) {
  const [value, setValue] = useState(0);
  const [preview, setPreview] = useState(null);
  const activeValue = preview ?? value;

  function valueFromPointer(event, index) {
    const rect = event.currentTarget.getBoundingClientRect();
    const isHalf = event.clientX - rect.left < rect.width / 2;
    return index + (isHalf ? 0.5 : 1);
  }

  return h("div", { className: "field rating-field" },
    h("span", null, Icon ? h(Icon, { size: 14 }) : null, label),
    h("input", { type: "hidden", name, value, readOnly: true }),
    h("div", { className: "star-picker", role: "radiogroup", "aria-label": label },
      [0, 1, 2, 3, 4].map((index) => h("button", {
        key: index,
        type: "button",
        className: "star-picker-btn",
        "aria-label": `${index + 1} estrela${index ? "s" : ""}`,
        onMouseMove: (event) => setPreview(valueFromPointer(event, index)),
        onMouseLeave: () => setPreview(null),
        onFocus: () => setPreview(index + 1),
        onBlur: () => setPreview(null),
        onClick: (event) => setValue(valueFromPointer(event, index))
      }, h(StarGlyph, { fill: starFillPercent(activeValue, index) }))),
      h("button", {
        type: "button",
        className: "rating-clear",
        "aria-label": "Limpar nota",
        onClick: () => setValue(0)
      }, "×"),
      h("strong", { className: "rating-value" }, `${formatNumber(activeValue)} de 5`)
    )
  );
}

function StarGlyph({ fill }) {
  return h("span", { className: "rating-star", "aria-hidden": "true" },
    h("span", { className: "rating-star-empty" }, "\u2605"),
    h("span", { className: "rating-star-fill", style: { width: `${fill}%` } }, "\u2605")
  );
}

function SelectField({ name, label, icon, options = [], defaultValue = "" }) {
  return h(Field, { label, icon },
    h("select", { name, defaultValue },
      h("option", { value: "" }, ""),
      options.map((option) => h("option", { value: option, key: option }, option))
    )
  );
}

function TextAreaField({ name, label, icon: Icon }) {
  return h("label", { className: "field full" },
    h("span", null, Icon ? h(Icon, { size: 14 }) : null, label),
    h("textarea", { name })
  );
}

function EmptyState({ text }) {
  return h("div", { className: "empty" }, h(BookOpen, { size: 18 }), text);
}

function renderArticleContent(content) {
  const blocks = String(content || "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return h("p", null, "Sem conteudo.");

  return blocks.map((block, index) => {
    if (block.startsWith("### ")) return h("h4", { key: index }, block.slice(4));
    if (block.startsWith("## ")) return h("h3", { key: index }, block.slice(3));
    if (block.startsWith("# ")) return h("h2", { key: index }, block.slice(2));
    if (/^[-*] /m.test(block)) {
      return h("ul", { key: index },
        block.split("\n").map((line, itemIndex) => h("li", { key: itemIndex }, line.replace(/^[-*] /, "")))
      );
    }
    return h("p", { key: index }, block);
  });
}

function bubbleVisibilityLabel(value) {
  return {
    public: "Publica",
    private: "Privada",
    restricted: "Restrita"
  }[value] || "Restrita";
}

function memberRoleLabel(value) {
  return {
    owner: "Owner",
    moderator: "Moderador",
    member: "Membro"
  }[value] || "Membro";
}

function memberStatusLabel(value) {
  return {
    invited: "Convidado",
    active: "Ativo",
    pending: "Pendente",
    removed: "Removido",
    blocked: "Bloqueado"
  }[value] || "Visitante";
}

function moderationStatusLabel(value) {
  return {
    hidden: "Oculto",
    removed: "Removido",
    archived: "Arquivado"
  }[value] || value;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erro na requisição.");
  return data.db || data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function getMetrics(log) {
  const rated = log.filter((item) => Number(item.rating));
  return {
    totalListenings: log.length,
    uniqueAlbums: new Set(log.map((item) => item.album).filter(Boolean)).size,
    uniqueArtists: new Set(log.map((item) => item.artist).filter(Boolean)).size,
    hours: sum(log.map((item) => Number(item.durationMin || 0))) / 60,
    avgRating: rated.length ? sum(rated.map((item) => normalizeRatingToFive(item.rating))) / rated.length : 0,
    favorites: log.filter((item) => item.favorite === "Sim").length
  };
}

function groupMetric(log, key, options = {}) {
  const map = new Map();
  for (const item of log) {
    const rawLabel = item[key] || "Sem classificação";
    const label = options.monthLabels ? formatMonth(rawLabel) : rawLabel;
    if (!map.has(label)) map.set(label, { label, count: 0, minutes: 0, ratings: [] });
    const row = map.get(label);
    row.count += 1;
    row.minutes += Number(item.durationMin || 0);
    if (Number(item.rating)) row.ratings.push(normalizeRatingToFive(item.rating));
  }
  return [...map.values()].map((row) => ({
    label: row.label,
    count: row.count,
    hours: row.minutes / 60,
    avgRating: row.ratings.length ? sum(row.ratings) / row.ratings.length : 0
  })).sort((a, b) => b.count - a.count || b.hours - a.hours);
}

function topAlbums(log) {
  return [...log]
    .filter((item) => Number(item.rating))
    .sort((a, b) => normalizeRatingToFive(b.rating) - normalizeRatingToFive(a.rating))
    .slice(0, 12)
    .map((item) => ({ album: item.album, artist: item.artist, rating: normalizeRatingToFive(item.rating), date: item.date }));
}

function albumForLog(item, catalog) {
  return catalog.find((album) => album.id === item.catalogId)
    || catalog.find((album) => album.album === item.album && album.artist === item.artist)
    || {};
}

function diaryDay(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-(\d{2})$/);
  return match ? match[1] : "--";
}

function diaryMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "---";
  const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return monthNames[Number(match[2]) - 1].toUpperCase();
}

function diaryYear(value) {
  const match = String(value || "").match(/^(\d{4})-\d{2}$/);
  return match ? match[1] : "";
}

function ratingStars(value) {
  const rating = Math.max(0, Math.min(10, Number(value || 0)));
  const filled = Math.round(rating / 2);
  return "★★★★★".split("").map((star, index) => h("span", { key: index, className: index < filled ? "filled" : "" }, star));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ratingStarsDisplay(value) {
  const rating = normalizeRatingToFive(value);
  return [0, 1, 2, 3, 4].map((index) => h(StarGlyph, { key: index, fill: starFillPercent(rating, index) }));
}

function normalizeRatingToFive(value) {
  const rating = Math.max(0, Number(value || 0));
  return Math.min(5, rating > 5 ? rating / 2 : rating);
}

function starFillPercent(value, index) {
  const rating = normalizeRatingToFive(value);
  return Math.max(0, Math.min(1, rating - index)) * 100;
}

function formatDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value || "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function approvalStatusLabel(value) {
  if (value === "pending") return "Pendente";
  if (value === "rejected") return "Recusado";
  return "Aprovado";
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function displayReleaseDate(value) {
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return formatDate(text);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return formatDate(text.slice(0, 10));
  if (/^\d{4}-\d{2}$/.test(text)) return formatMonth(text);
  return text;
}

function formatMonth(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return value || "";
  const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${monthNames[Number(match[2]) - 1]}/${match[1]}`;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

createRoot(document.getElementById("root")).render(h(App));
