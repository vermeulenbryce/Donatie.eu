import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { LegacyUiSessionProvider } from '../context/LegacyUiSessionContext'
import { PublicLayout } from '../components/public/PublicLayout'
import { RouteOutletFallback } from '../components/RouteOutletFallback'
import { ADMIN_SECTIONS } from '../pages/admin/portal/adminNav'

const PublicHomePage = lazy(() =>
  import('../pages/public/PublicHomePage').then((m) => ({ default: m.PublicHomePage })),
)
const GoedeDoelenPage = lazy(() =>
  import('../pages/public/GoedeDoelenPage').then((m) => ({ default: m.GoedeDoelenPage })),
)
const RanglijstPage = lazy(() =>
  import('../pages/public/RanglijstPage').then((m) => ({ default: m.RanglijstPage })),
)
const StickerPage = lazy(() => import('../pages/public/StickerPage').then((m) => ({ default: m.StickerPage })))
const FaqPage = lazy(() => import('../pages/public/FaqPage').then((m) => ({ default: m.FaqPage })))
const PuntensysteemPage = lazy(() =>
  import('../pages/public/PuntensysteemPage').then((m) => ({ default: m.PuntensysteemPage })),
)
const StartProjectPage = lazy(() =>
  import('../pages/public/StartProjectPage').then((m) => ({ default: m.StartProjectPage })),
)
const DenkMeePage = lazy(() =>
  import('../pages/public/DenkMeePage').then((m) => ({ default: m.DenkMeePage })),
)
const NieuwsPage = lazy(() =>
  import('../pages/public/NieuwsPage').then((m) => ({ default: m.NieuwsPage })),
)
const AccountDashboardPage = lazy(() =>
  import('../pages/public/AccountDashboardPage').then((m) => ({ default: m.AccountDashboardPage })),
)
const CommunitiesPage = lazy(() =>
  import('../pages/public/CommunitiesPage').then((m) => ({ default: m.CommunitiesPage })),
)
const CommunityProjectDonatePage = lazy(() =>
  import('../pages/public/CommunityProjectDonatePage').then((m) => ({ default: m.CommunityProjectDonatePage })),
)

function lazyLegal(title: string) {
  return lazy(() =>
    import('../pages/public/LegalInfoPage').then((m) => ({
      default: function JuridischRoutePage() {
        return <m.LegalInfoPage title={title} />
      },
    })),
  )
}

const HomePage = lazy(() => import('../pages/HomePage').then((m) => ({ default: m.HomePage })))
const AuthPage = lazy(() => import('../pages/AuthPage').then((m) => ({ default: m.AuthPage })))
const AdminLoginPage = lazy(() =>
  import('../pages/admin/AdminLoginPage').then((m) => ({ default: m.AdminLoginPage })),
)
const AdminPortalPage = lazy(() =>
  import('../pages/admin/AdminPortalPage').then((m) => ({ default: m.AdminPortalPage })),
)
const AdminPortalShell = lazy(() =>
  import('../pages/admin/portal/AdminPortalShell').then((m) => ({ default: m.AdminPortalShell })),
)
const AdminDashboardSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminDashboardSection').then((m) => ({
    default: m.AdminDashboardSection,
  })),
)
const AdminFeaturedSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminFeaturedSection').then((m) => ({
    default: m.AdminFeaturedSection,
  })),
)
const AdminFaqSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminFaqSection').then((m) => ({ default: m.AdminFaqSection })),
)
const AdminNewsSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminNewsSection').then((m) => ({
    default: m.AdminNewsSection,
  })),
)
const AdminGoedeDoelenSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminGoedeDoelenSection').then((m) => ({
    default: m.AdminGoedeDoelenSection,
  })),
)
const AdminLogosSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminLogosSection').then((m) => ({ default: m.AdminLogosSection })),
)
const AdminVolunteerSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminVolunteerSection').then((m) => ({
    default: m.AdminVolunteerSection,
  })),
)
const AdminCollectantSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminCollectantSection').then((m) => ({
    default: m.AdminCollectantSection,
  })),
)
const AdminPaymentsSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminPaymentsSection').then((m) => ({
    default: m.AdminPaymentsSection,
  })),
)
const AdminFinanceSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminFinanceSection').then((m) => ({
    default: m.AdminFinanceSection,
  })),
)
const AdminProjectsSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminProjectsSection').then((m) => ({
    default: m.AdminProjectsSection,
  })),
)
const AdminUsersSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminUsersSection').then((m) => ({
    default: m.AdminUsersSection,
  })),
)
const AdminFooterSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminFooterSection').then((m) => ({
    default: m.AdminFooterSection,
  })),
)
const AdminPuntenSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminPuntenSection').then((m) => ({
    default: m.AdminPuntenSection,
  })),
)
const AdminBedragenSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminBedragenSection').then((m) => ({
    default: m.AdminBedragenSection,
  })),
)
const AdminShopSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminShopSection').then((m) => ({ default: m.AdminShopSection })),
)
const AdminMeldingenSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminMeldingenSection').then((m) => ({
    default: m.AdminMeldingenSection,
  })),
)
const AdminPushSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminPushSection').then((m) => ({ default: m.AdminPushSection })),
)
const AdminSessionsSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminSessionsSection').then((m) => ({
    default: m.AdminSessionsSection,
  })),
)
const AdminShadowViewPage = lazy(() =>
  import('../pages/admin/portal/sections/AdminShadowViewPage').then((m) => ({
    default: m.AdminShadowViewPage,
  })),
)
const AdminPlaceholderSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminPlaceholderSection').then((m) => ({
    default: m.AdminPlaceholderSection,
  })),
)
const AdminResponsiveSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminResponsiveSection').then((m) => ({
    default: m.AdminResponsiveSection,
  })),
)
const AdminInfluencersSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminInfluencersSection').then((m) => ({
    default: m.AdminInfluencersSection,
  })),
)
const AdminCommunitiesSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminCommunitiesSection').then((m) => ({
    default: m.AdminCommunitiesSection,
  })),
)
const AdminMarktenSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminMarktenSection').then((m) => ({
    default: m.AdminMarktenSection,
  })),
)
const AdminEmailSection = lazy(() =>
  import('../pages/admin/portal/sections/AdminEmailSection').then((m) => ({ default: m.AdminEmailSection })),
)
const VolunteerApplyPage = lazy(() =>
  import('../pages/public/VolunteerApplyPage').then((m) => ({ default: m.VolunteerApplyPage })),
)
const CollectantApplyPage = lazy(() =>
  import('../pages/public/CollectantApplyPage').then((m) => ({ default: m.CollectantApplyPage })),
)
const AdminAccessPage = lazy(() =>
  import('../pages/public/AdminAccessPage').then((m) => ({ default: m.AdminAccessPage })),
)
const ProfilesOverviewPage = lazy(() =>
  import('../pages/ProfilesOverviewPage').then((m) => ({ default: m.ProfilesOverviewPage })),
)
const FrameworkStatusPage = lazy(() =>
  import('../pages/FrameworkStatusPage').then((m) => ({ default: m.FrameworkStatusPage })),
)
const ProjectsPage = lazy(() =>
  import('../pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })),
)
const DonationsPage = lazy(() =>
  import('../pages/DonationsPage').then((m) => ({ default: m.DonationsPage })),
)
const PasswordResetPage = lazy(() =>
  import('../pages/PasswordResetPage').then((m) => ({ default: m.PasswordResetPage })),
)

const LegalPrivacy = lazyLegal('Privacybeleid')
const LegalAlgemene = lazyLegal('Algemene voorwaarden')
const LegalAnbi = lazyLegal('ANBI-info')
const LegalTransparantie = lazyLegal('Transparantie')
const LegalAntiFraude = lazyLegal('Anti-fraude beleid')
const LegalCookie = lazyLegal('Cookieverklaring')
const LegalGegevens = lazyLegal('Gegevensverwerking')
const LegalAvg = lazyLegal('AVG / GDPR')
const LegalInzage = lazyLegal('Recht op inzage')

export function AppRouter() {
  return (
    <LegacyUiSessionProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteOutletFallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHomePage />} />
              <Route path="/sticker-bestellen" element={<StickerPage />} />
              <Route path="/goede-doelen" element={<GoedeDoelenPage />} />
              <Route path="/denk-mee" element={<DenkMeePage />} />
              <Route path="/ranglijst" element={<RanglijstPage />} />
              <Route path="/start-project" element={<StartProjectPage />} />
              <Route path="/puntensysteem" element={<PuntensysteemPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/nieuws" element={<NieuwsPage />} />
              <Route path="/juridisch/privacybeleid" element={<LegalPrivacy />} />
              <Route path="/juridisch/algemene-voorwaarden" element={<LegalAlgemene />} />
              <Route path="/juridisch/anbi-info" element={<LegalAnbi />} />
              <Route path="/juridisch/transparantie" element={<LegalTransparantie />} />
              <Route path="/juridisch/anti-fraude-beleid" element={<LegalAntiFraude />} />
              <Route path="/juridisch/cookieverklaring" element={<LegalCookie />} />
              <Route path="/juridisch/gegevensverwerking" element={<LegalGegevens />} />
              <Route path="/juridisch/avg-gdpr" element={<LegalAvg />} />
              <Route path="/juridisch/recht-op-inzage" element={<LegalInzage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/reset-password" element={<PasswordResetPage />} />
              <Route path="/account" element={<AccountDashboardPage />} />
              <Route path="/account/vrijwilliger" element={<VolunteerApplyPage />} />
              <Route path="/account/collectant" element={<CollectantApplyPage />} />
              <Route path="/account/admin-toegang" element={<AdminAccessPage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/community-project/:projectId" element={<CommunityProjectDonatePage />} />
            </Route>

            <Route path="/platform" element={<HomePage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/legacy" element={<AdminPortalPage />} />
            <Route path="/admin" element={<AdminPortalShell />}>
              <Route index element={<AdminDashboardSection />} />
              <Route path="dashboard" element={<AdminDashboardSection />} />
              <Route path="featured" element={<AdminFeaturedSection />} />
              <Route path="goededoelen" element={<AdminGoedeDoelenSection />} />
              <Route path="faq" element={<AdminFaqSection />} />
              <Route path="logos" element={<AdminLogosSection />} />
              <Route path="nieuws" element={<AdminNewsSection />} />
              <Route path="homepage" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="users" element={<AdminUsersSection />} />
              <Route path="vrijwilliger" element={<AdminVolunteerSection />} />
              <Route path="collectanten" element={<AdminCollectantSection />} />
              <Route path="betalingen" element={<AdminPaymentsSection />} />
              <Route path="projecten" element={<AdminProjectsSection />} />
              <Route path="finance" element={<AdminFinanceSection />} />
              <Route path="footer" element={<AdminFooterSection />} />
              <Route path="punten" element={<AdminPuntenSection />} />
              <Route path="bedragen" element={<AdminBedragenSection />} />
              <Route path="shop" element={<AdminShopSection />} />
              <Route path="meldingen" element={<AdminMeldingenSection />} />
              <Route path="push" element={<AdminPushSection />} />
              <Route path="sessions" element={<AdminSessionsSection />} />
              <Route path="shadow/:userId" element={<AdminShadowViewPage />} />
              <Route path="responsive" element={<AdminResponsiveSection />} />
              <Route path="influencers" element={<AdminInfluencersSection />} />
              <Route path="communities" element={<AdminCommunitiesSection />} />
              <Route path="markten" element={<AdminMarktenSection />} />
              <Route path="email" element={<AdminEmailSection />} />
              {ADMIN_SECTIONS.filter((s) => !s.livePhase1 && s.id !== 'dashboard').map((s) => (
                <Route key={s.id} path={s.id} element={<AdminPlaceholderSection id={s.id} />} />
              ))}
            </Route>
            <Route path="/profiles-overview" element={<ProfilesOverviewPage />} />
            <Route path="/framework-status" element={<FrameworkStatusPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/donations" element={<DonationsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </LegacyUiSessionProvider>
  )
}
