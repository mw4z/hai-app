'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

/**
 * Privacy policy — single page that serves both:
 *   - the in-app WebView screen (Capacitor wraps this same Next.js app
 *     via server.url, so the in-app and public web policies are
 *     identical by construction; one source of truth)
 *   - the public website (e.g. https://app.hai-app.net/privacy)
 *
 * Arabic is the primary language; English follows for parity. Sections
 * are numbered the same in both halves so support / legal can refer to
 * "Section 5" without ambiguity. Tone is professional but plain — no
 * boilerplate legalese, no claims that aren't true.
 */

const LAST_UPDATED_AR = 'أبريل 2026'
const LAST_UPDATED_EN = 'April 2026'
const SUPPORT_EMAIL = 'support@hai-app.net'
// Minimum age to use Hai. Set to 13 (COPPA-aligned) for now; raise to
// 18 if product direction requires it — change in BOTH the AR and EN
// sections (they reference this constant).
const MIN_AGE = 13

export default function PrivacyPage() {
  const { t, lang } = useLanguage()
  const router = useRouter()

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900 px-6 py-8 max-w-2xl mx-auto text-gray-700 dark:text-gray-300">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-sm mb-6 self-start"
      >
        {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
        {t('common_back')}
      </button>

      {/* ── Arabic ─────────────────────────────────────────────────────── */}
      <article className="mb-12" dir="rtl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">سياسة الخصوصية</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">آخر تحديث: {LAST_UPDATED_AR}</p>

        <div className="prose prose-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">خصوصيتك تهمنا</h2>
            <p>
              في تطبيق <strong>حي</strong> نحترم خصوصيتك ونلتزم بحماية بياناتك.
              تشرح هذه السياسة بشكل واضح ومختصر نوع البيانات التي نجمعها،
              وكيف نستخدمها، وحقوقك تجاهها.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">1. البيانات التي نجمعها</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li><strong>رقم الجوال:</strong> للتحقق من هويتك وتسجيل الدخول.</li>
              <li><strong>الاسم:</strong> يظهر للمستخدمين في حيّك.</li>
              <li><strong>الموقع:</strong> لتحديد الحي وعرض المحتوى المحلي ذي الصلة.</li>
              <li><strong>الجنس:</strong> لعرض المحتوى المناسب (مثل قسم النساء فقط).</li>
              <li><strong>البريد الإلكتروني (اختياري):</strong> للتواصل وتأمين الحساب.</li>
              <li><strong>المحتوى الذي تنشئه:</strong> المنشورات، التعليقات، التفاعلات، الرسائل.</li>
              <li><strong>بيانات تشغيلية:</strong> سجلات تقنية بسيطة لتحسين الأداء وحماية الخدمة من الإساءة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">2. كيف نستخدم بياناتك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>عرض المحتوى المناسب لحيّك.</li>
              <li>إرسال رموز التحقق وإشعارات الخدمة.</li>
              <li>تحسين تجربة التطبيق وأدائه.</li>
              <li>حماية المجتمع من الإساءة والمحتوى المخالف.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">3. الموقع الجغرافي</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>نستخدم موقعك لتحديد حيّك وعرض المحتوى المحلي.</li>
              <li>التطبيق <strong>لا يتتبع موقعك بشكل مستمر</strong>، ولا يعمل في الخلفية إلا إذا أُعلن عن ذلك صراحةً ووافقت عليه.</li>
              <li>الموقع الدقيق لا يُشارك مع المستخدمين الآخرين.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">4. مشاركة البيانات</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li><strong>لا نبيع بياناتك الشخصية لأي جهة.</strong></li>
              <li><strong>لا نشارك بياناتك مع جهات خارجية لأغراض تسويقية.</strong></li>
              <li>قد نشارك بيانات محدودة في الحالات التالية فقط:
                <ul className="list-disc pr-5 mt-1 space-y-1">
                  <li>عند الضرورة لتشغيل الخدمة (مزودو الاستضافة، الإشعارات، التحقق برسائل SMS).</li>
                  <li>الالتزام بمتطلبات قانونية أو طلبات رسمية مشروعة.</li>
                  <li>حماية المستخدمين أو منع الإساءة والاحتيال.</li>
                  <li>بناءً على موافقتك الصريحة.</li>
                </ul>
              </li>
              <li>اسمك ومنشوراتك مرئية لسكان حيّك. رقم جوالك <strong>لا يظهر</strong> للمستخدمين.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">5. الاحتفاظ بالبيانات وحذفها</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>نحتفظ ببياناتك طوال فترة استخدامك للحساب.</li>
              <li>عند حذف الحساب، يتم حذف بياناتك الشخصية أو إخفاء هويتها قدر الإمكان.</li>
              <li>قد نحتفظ ببعض السجلات لفترة محدودة لأغراض قانونية أو أمنية أو لمنع الإساءة أو لأغراض المراجعة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">6. حماية البيانات</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>نستخدم اتصالات مشفرة (HTTPS) لجميع الطلبات.</li>
              <li>الوصول إلى البيانات محدود على فريق العمل المعتمد فقط ووفق ضوابط داخلية.</li>
              <li>نطبّق إجراءات إدارية وتقنية معقولة لحماية بياناتك.</li>
              <li>على الرغم من ذلك، لا يمكن لأي خدمة على الإنترنت أن تضمن أمناً مطلقاً.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">7. حقوقك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>الوصول إلى بياناتك الشخصية وطلب نسخة منها.</li>
              <li>تصحيح أو تحديث معلومات حسابك في أي وقت.</li>
              <li>حذف حسابك من إعدادات التطبيق أو عبر التواصل معنا.</li>
              <li>الإبلاغ عن محتوى أو مستخدمين يخالفون قواعد الاستخدام.</li>
              <li>حظر أي مستخدم لإيقاف ظهور محتواه ورسائله.</li>
              <li>التواصل مع فريق الدعم في أي وقت.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">8. طبيعة الخدمة وإخلاء المسؤولية</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>حي منصّة تربط الجيران والمستخدمين المحليين.</li>
              <li>حي ليس طرفاً في أي معاملة أو اتفاقية أو رحلة أو خدمة أو صفقة سوق تتم بين المستخدمين.</li>
              <li>المستخدمون مسؤولون عن التحقق من المعلومات والتعامل بحذر وأمان.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">9. التنبيهات الطارئة والمحتوى العاجل</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>على المستخدم التحقق من المعلومات الطارئة أو العاجلة قبل اتخاذ أي إجراء بناءً عليها.</li>
              <li>قد نقوم بمراجعة أو إخفاء أو إزالة المحتوى الطارئ عند الضرورة لأسباب تتعلق بالسلامة أو السياسة.</li>
              <li>التطبيق ليس بديلاً عن خدمات الطوارئ الرسمية.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">10. الفئة العمرية</h2>
            <p>
              التطبيق مخصص لمن أعمارهم {MIN_AGE} عاماً فأكثر. إذا كنت دون
              هذا العمر، فلا يحق لك استخدام التطبيق. قد يُطلب من القاصرين
              موافقة وليّ الأمر وفق التشريعات المعمول بها.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">11. ملفات تعريف الارتباط</h2>
            <p>
              نستخدم ملفات تعريف ارتباط أساسية فقط لتشغيل التطبيق
              (تسجيل الدخول، اللغة، المظهر). لا نستخدم ملفات تتبع
              إعلانية ولا نشارك بيانات لأغراض الإعلانات.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">12. تحديثات السياسة</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>قد نُحدّث هذه السياسة من وقت لآخر.</li>
              <li>عند حدوث تغيير جوهري، سنُعلمك بالطرق المناسبة (داخل التطبيق أو عبر البريد الإلكتروني).</li>
              <li>استمرار استخدامك للتطبيق بعد التحديث يعني قبولك للسياسة المُحدَّثة.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">13. تواصل معنا</h2>
            <p>
              لأي سؤال أو طلب يتعلق بخصوصيتك أو بياناتك، تواصل معنا عبر
              البريد الإلكتروني:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 dark:text-primary-400 underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </article>

      <div className="border-t border-gray-200 dark:border-gray-700 my-8" />

      {/* ── English ────────────────────────────────────────────────────── */}
      <article dir="ltr">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Last updated: {LAST_UPDATED_EN}</p>

        <div className="prose prose-sm text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">Your Privacy Matters</h2>
            <p>
              At <strong>Hai</strong>, we respect your privacy and are committed to
              protecting your data. This policy explains, in plain language, what
              information we collect, how we use it, and what your rights are.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">1. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Phone number:</strong> to verify your identity and sign you in.</li>
              <li><strong>Name:</strong> shown to other users in your neighborhood.</li>
              <li><strong>Location:</strong> to determine your neighborhood and show relevant local content.</li>
              <li><strong>Gender:</strong> to show appropriate content (e.g. women-only section).</li>
              <li><strong>Email (optional):</strong> for communication and account security.</li>
              <li><strong>Content you create:</strong> posts, comments, reactions, messages.</li>
              <li><strong>Operational data:</strong> basic technical logs used to improve performance and protect the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Show content relevant to your neighborhood.</li>
              <li>Send verification codes and service notifications.</li>
              <li>Improve the app's experience and performance.</li>
              <li>Protect the community from abuse and harmful content.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">3. Location</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We use your location to determine your neighborhood and show local content.</li>
              <li>The app <strong>does not continuously track your location</strong>, and does not run location tracking in the background unless explicitly stated and consented to.</li>
              <li>Your precise location is not shared with other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">4. Data Sharing</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>We do not sell users' personal data.</strong></li>
              <li><strong>We do not share users' personal data with third parties for marketing purposes.</strong></li>
              <li>We may share limited data only when:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Necessary to operate the service (hosting, push notifications, SMS verification).</li>
                  <li>Required to comply with the law or a lawful request.</li>
                  <li>Needed to protect users or prevent abuse and fraud.</li>
                  <li>You have given explicit consent.</li>
                </ul>
              </li>
              <li>Your name and posts are visible to residents of your neighborhood. Your phone number is <strong>never shown</strong> to other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">5. Data Retention &amp; Deletion</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We retain your data while your account is active.</li>
              <li>When you delete your account, your personal data is deleted or anonymized where possible.</li>
              <li>Some records may be retained for a limited period for legal, security, abuse-prevention, or audit purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">6. Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All requests use encrypted connections (HTTPS).</li>
              <li>Internal access controls limit data access to authorized personnel only.</li>
              <li>We apply reasonable administrative and technical safeguards.</li>
              <li>No internet service can guarantee absolute security.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">7. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access your personal data and request a copy.</li>
              <li>Correct or update your account information at any time.</li>
              <li>Delete your account from the app settings or by contacting us.</li>
              <li>Report content or users that violate our policies.</li>
              <li>Block any user to stop seeing their content and messages.</li>
              <li>Reach our support team at any time.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">8. Service Nature &amp; Disclaimer</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Hai is a platform that connects neighbors and local users.</li>
              <li>Hai is not a party to any transaction, agreement, ride, service, or marketplace deal between users.</li>
              <li>Users are responsible for verifying information and dealing safely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">9. Emergency &amp; Urgent Content</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Always verify urgent or emergency information before acting on it.</li>
              <li>We may review, hide, or remove emergency content when necessary for safety or policy reasons.</li>
              <li>The app is not a substitute for official emergency services.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">10. Age Requirement</h2>
            <p>
              You must be at least {MIN_AGE} years old to use Hai. If you are
              under this age, you are not permitted to use the app. Minors may
              be required to obtain parental consent where applicable law requires.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">11. Cookies</h2>
            <p>
              We only use essential cookies to run the app (login, language,
              theme). We do not use advertising or tracking cookies, and we do
              not share data for advertising purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">12. Policy Updates</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We may update this policy from time to time.</li>
              <li>For material changes, we will notify you through appropriate means (in-app or by email).</li>
              <li>Continued use of the app after an update means acceptance of the updated policy.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-2">13. Contact</h2>
            <p>
              For any privacy or data question, reach us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-600 dark:text-primary-400 underline">
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
