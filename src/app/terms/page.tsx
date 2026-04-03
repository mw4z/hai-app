'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

export default function TermsPage() {
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
        <h1 className="text-2xl font-bold text-gray-900 mb-2">الشروط والأحكام</h1>
        <p className="text-xs text-gray-400 mb-6">آخر تحديث: مارس 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">مرحباً بك في حي</h2>
            <p>حي هو تطبيق مجتمعي يربط سكان الحي الواحد ببعضهم. باستخدامك للتطبيق، أنت توافق على هذه الشروط.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. حسابك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>تحتاج رقم جوال سعودي صالح للتسجيل</li>
              <li>أنت مسؤول عن حسابك وكل ما يُنشر من خلاله</li>
              <li>يجب أن تكون المعلومات اللي تقدمها صحيحة</li>
              <li>حساب واحد لكل شخص فقط</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. قواعد المحتوى</h2>
            <p>عشان نحافظ على بيئة آمنة ومحترمة، يمنع نشر:</p>
            <ul className="list-disc pr-5 space-y-1">
              <li>محتوى مسيء أو مهين أو عنصري</li>
              <li>معلومات كاذبة أو مضللة</li>
              <li>إعلانات مزعجة أو سبام</li>
              <li>محتوى يخالف الأنظمة السعودية</li>
              <li>معلومات شخصية للآخرين بدون إذنهم</li>
              <li>أي محتوى غير مناسب أو مخل بالآداب</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. حيّك ومنطقتك</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>يتم تحديد حيّك تلقائياً عن طريق موقعك</li>
              <li>تقدر تشوف محتوى الأحياء الثانية بس ما تقدر تنشر فيها</li>
              <li>النشر مسموح فقط في حيّك</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. الإبلاغ والإشراف</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>تقدر تبلّغ عن أي محتوى مخالف</li>
              <li>المنشورات اللي تجمع بلاغات كثيرة تنحذف تلقائياً</li>
              <li>نحتفظ بحق إيقاف أو حذف أي حساب يخالف القواعد</li>
              <li>الإيقاف ممكن يكون مؤقت أو دائم حسب المخالفة</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. المسؤولية</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>كل مستخدم مسؤول عن محتواه</li>
              <li>حي ما يتحمل مسؤولية أي تعامل بين المستخدمين</li>
              <li>التطبيق يُقدم "كما هو" بدون ضمانات</li>
              <li>نسعى لتوفير خدمة مستقرة لكن ما نضمن عدم انقطاعها</li>
            </ul>
          </section>

<section>
  <h2 className="text-base font-semibold text-gray-800 mb-2">6. تنسيق المشاوير والتعامل بين المستخدمين</h2>
  <ul className="list-disc pr-5 space-y-1">
    <li>ميزة طلب المشوار في حي هي وسيلة لتسهيل التواصل والتنسيق بين المستخدمين فقط</li>
    <li>التطبيق لا يقدم خدمة نقل، ولا يعمل كمزود خدمة توصيل</li>
    <li>أي اتفاق يتم بين المستخدمين (مثل الوقت أو المقابل) يتم بشكل مباشر بينهم دون تدخل من التطبيق</li>
    <li>حي لا يضمن التزام أي طرف، ولا يضمن الوصول، ولا جودة أو دقة أي معلومات أو اتفاق</li>
    <li>أي تفاعل أو تنقل يتم على مسؤولية المستخدمين بالكامل</li>
    <li>التطبيق لا يدير ولا يشرف على أي معاملات مالية بين المستخدمين</li>
    <li>التطبيق لا يقوم بالتحقق من هوية أو موثوقية المستخدمين بشكل كامل، ويجب على المستخدم اتخاذ الحذر عند التعامل مع الآخرين</li>
  </ul>
</section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. التعديلات</h2>
            <p>نقدر نعدل هذه الشروط بأي وقت. استمرارك في استخدام التطبيق يعني موافقتك على التعديلات.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. القانون المعمول به</h2>
            <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية.</p>
          </section>
        </div>
      </article>

      {/* Divider */}
      <div className="border-t border-gray-200 my-8" />

      {/* English Version */}
      <article dir="ltr">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-xs text-gray-400 mb-6">Last updated: March 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Welcome to Hai</h2>
            <p>Hai is a neighborhood community app that connects residents within the same district. By using the app, you agree to these terms.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">1. Your Account</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>A valid Saudi phone number is required to sign up</li>
              <li>You are responsible for your account and everything posted through it</li>
              <li>The information you provide must be accurate</li>
              <li>One account per person only</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">2. Content Rules</h2>
            <p>To keep the community safe and respectful, the following is not allowed:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Offensive, abusive, or discriminatory content</li>
              <li>False or misleading information</li>
              <li>Spam or excessive advertising</li>
              <li>Content that violates Saudi laws and regulations</li>
              <li>Sharing others' personal information without consent</li>
              <li>Any inappropriate or indecent content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">3. Your Neighborhood</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your neighborhood is determined automatically using your location</li>
              <li>You can browse other neighborhoods but cannot post in them</li>
              <li>Posting is only allowed in your own neighborhood</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">4. Reporting & Moderation</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You can report any content that violates the rules</li>
              <li>Posts that receive multiple reports are automatically removed</li>
              <li>We reserve the right to suspend or delete any account that violates the rules</li>
              <li>Suspension may be temporary or permanent depending on the violation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">5. Liability</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Each user is responsible for their own content</li>
              <li>Hai is not responsible for any interactions between users</li>
              <li>The app is provided "as is" without warranties</li>
              <li>We aim to provide a stable service but cannot guarantee uninterrupted access</li>
            </ul>
          </section>

<section>
  <h2 className="text-base font-semibold text-gray-800 mb-2">6. Ride Coordination & User Interactions</h2>
  <ul className="list-disc pl-5 space-y-1">
    <li>The ride request feature in Hai is only a tool to facilitate communication and coordination between users</li>
    <li>The app does not provide transportation services and does not act as a transport provider</li>
    <li>Any agreement (such as timing or compensation) is made directly between users without involvement from the app</li>
    <li>Hai does not guarantee user commitment, arrival, or the accuracy or quality of any information or agreement</li>
    <li>All interactions and movements are conducted at the users’ own responsibility</li>
    <li>The app does not handle or process any financial transactions between users</li>
    <li>The app does not fully verify the identity or reliability of users, and users should exercise caution when interacting with others</li>
  </ul>
</section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">7. Changes</h2>
            <p>We may update these terms at any time. Continued use of the app means you accept the changes.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">8. Governing Law</h2>
            <p>These terms are governed by the laws of the Kingdom of Saudi Arabia.</p>
          </section>
        </div>
      </article>
    </main>
  )
}
