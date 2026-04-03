'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

export default function PrivacyPage() {
  const { t, lang } = useLanguage()
  const router = useRouter()

  return (
    <main className="min-h-screen bg-white px-6 py-8 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-400 text-sm mb-6 self-start">
        {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
        {t('common_back')}
      </button>

      {/* Arabic Version */}
      <article className="mb-12" dir="rtl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">سياسة الخصوصية</h1>
        <p className="text-xs text-gray-400 mb-6">آخر تحديث: مارس 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">خصوصيتك تهمنا</h2>
            <p>نحن في حي نحترم خصوصيتك ونلتزم بحماية بياناتك. هنا نوضح لك كيف نجمع ونستخدم معلوماتك.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. البيانات اللي نجمعها</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li><strong>رقم الجوال:</strong> للتحقق من هويتك وتسجيل الدخول</li>
              <li><strong>الاسم:</strong> يظهر للمستخدمين الآخرين في حيّك</li>
              <li><strong>الموقع:</strong> لتحديد حيّك وعرض المحتوى المناسب</li>
              <li><strong>الجنس:</strong> لعرض المحتوى المناسب (مثل قسم النساء فقط)</li>
              <li><strong>البريد الإلكتروني:</strong> اختياري، للتواصل وتأمين الحساب</li>
              <li><strong>المحتوى:</strong> المنشورات والتعليقات والتفاعلات</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. كيف نستخدم بياناتك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>تحديد حيّك وعرض المحتوى الصحيح</li>
              <li>إرسال رموز التحقق عبر الجوال</li>
              <li>إرسال الإشعارات (تعليقات، تفاعلات، تنبيهات الحي)</li>
              <li>تحسين تجربة التطبيق</li>
              <li>حماية المجتمع من المحتوى المخالف</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. مشاركة البيانات</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>ما نبيع بياناتك لأي جهة</li>
              <li>اسمك ومنشوراتك مرئية لسكان حيّك فقط</li>
              <li>رقم جوالك <strong>لا يظهر</strong> لأي مستخدم آخر</li>
              <li>ممكن نشارك بيانات محدودة مع جهات رسمية إذا تطلب القانون ذلك</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. الموقع الجغرافي</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>نستخدم موقعك فقط لتحديد حيّك عند التسجيل</li>
              <li>ما نتتبع موقعك بشكل مستمر</li>
              <li>موقعك الدقيق لا يُخزن ولا يُشارك</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. حماية البيانات</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>نستخدم اتصالات مشفرة (HTTPS)</li>
              <li>كلمات المرور ورموز التحقق مشفرة</li>
              <li>الوصول للبيانات محدود على فريق العمل المعتمد فقط</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">6. حقوقك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>تقدر تعدل معلومات حسابك بأي وقت</li>
              <li>تقدر تحذف حسابك عن طريق التواصل معنا</li>
              <li>تقدر تطلب نسخة من بياناتك</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. ملفات تعريف الارتباط</h2>
            <p>نستخدم ملفات تعريف ارتباط أساسية فقط لتشغيل التطبيق (تسجيل الدخول، اللغة، المظهر). ما نستخدم ملفات تتبع أو إعلانات.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. التعديلات</h2>
            <p>ممكن نحدّث هذه السياسة. إذا كان التغيير جوهري، نعلمك من خلال التطبيق.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">9. تواصل معنا</h2>
            <p>إذا عندك أي سؤال عن خصوصيتك أو بياناتك، تواصل معنا عبر التطبيق أو البريد الإلكتروني.</p>
          </section>
        </div>
      </article>

      {/* Divider */}
      <div className="border-t border-gray-200 my-8" />

      {/* English Version */}
      <article dir="ltr">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-6">Last updated: March 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Your Privacy Matters</h2>
            <p>At Hai, we respect your privacy and are committed to protecting your data. Here's how we collect and use your information.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Phone number:</strong> To verify your identity and sign you in</li>
              <li><strong>Name:</strong> Displayed to other users in your neighborhood</li>
              <li><strong>Location:</strong> To determine your neighborhood and show relevant content</li>
              <li><strong>Gender:</strong> To show appropriate content (e.g., women-only section)</li>
              <li><strong>Email:</strong> Optional, for communication and account security</li>
              <li><strong>Content:</strong> Posts, comments, and reactions you create</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Determine your neighborhood and show the right content</li>
              <li>Send verification codes via SMS</li>
              <li>Send notifications (comments, reactions, neighborhood alerts)</li>
              <li>Improve the app experience</li>
              <li>Protect the community from harmful content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. Data Sharing</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We do not sell your data to anyone</li>
              <li>Your name and posts are visible only to residents in your neighborhood</li>
              <li>Your phone number is <strong>never shown</strong> to other users</li>
              <li>We may share limited data with authorities if required by law</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. Location Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We use your location only to determine your neighborhood during registration</li>
              <li>We do not continuously track your location</li>
              <li>Your exact location is not stored or shared</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. Data Protection</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>We use encrypted connections (HTTPS)</li>
              <li>Passwords and verification codes are encrypted</li>
              <li>Data access is limited to authorized team members only</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">6. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You can update your account information at any time</li>
              <li>You can delete your account by contacting us</li>
              <li>You can request a copy of your data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. Cookies</h2>
            <p>We only use essential cookies to run the app (login, language, theme). We do not use tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. Changes</h2>
            <p>We may update this policy. If the change is significant, we'll notify you through the app.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">9. Contact Us</h2>
            <p>If you have any questions about your privacy or data, reach out to us through the app or by email.</p>
          </section>
        </div>
      </article>
    </main>
  )
}
