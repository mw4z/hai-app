'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/hooks/useLanguage'
import { FiArrowRight, FiArrowLeft } from 'react-icons/fi'

export default function ChildSafetyPage() {
  const { t, lang } = useLanguage()
  const router = useRouter()

  return (
    <main className="min-h-screen bg-white px-6 py-8 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-gray-400 text-sm mb-6 self-start">
        {lang !== 'en' ? <FiArrowRight className="w-4 h-4" /> : <FiArrowLeft className="w-4 h-4" />}
        {t('common_back')}
      </button>

      {/* Arabic */}
      <article className="mb-12" dir="rtl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">معايير سلامة الأطفال</h1>
        <p className="text-xs text-gray-400 mb-6">آخر تحديث: أبريل 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">التزامنا</h2>
            <p>
              تطبيق "حي" لديه سياسة عدم تسامح مطلقة تجاه مواد الاعتداء الجنسي على الأطفال (CSAM)
              وأي محتوى يتعلق بالاعتداء الجنسي على الأطفال أو استغلالهم (CSAE). نلتزم بحماية القاصرين
              على منصّتنا من خلال أنظمة منع فعّالة، وأدوات إبلاغ سهلة، والتعاون الكامل مع السلطات المختصة.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">متطلبات العمر</h2>
            <p>
              يُشترط أن يكون عمر جميع المستخدمين 13 عامًا فأكثر. يتم التحقق من الهوية عبر رقم هاتف حقيقي
              مُثبت برمز OTP. نحتفظ بالحق في إغلاق أي حساب ينتمي لمستخدم تحت السن القانوني فورًا.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">أدوات المنع والاكتشاف</h2>
            <ul className="list-disc pr-5 space-y-1">
              <li>مراجعة آلية للمحتوى المرئي المنشور عبر فلاتر ذكية</li>
              <li>نظام إبلاغ داخلي متاح على كل منشور وتعليق وملف شخصي ورسالة</li>
              <li>مشرفون بشريون يراجعون البلاغات على مدار الساعة</li>
              <li>حظر تلقائي فوري عند اكتشاف محتوى مسيء</li>
              <li>حجب المستخدمين المتكرري المخالفات بشكل دائم</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">الإبلاغ</h2>
            <p>
              يمكن لأي مستخدم الإبلاغ عن محتوى أو سلوك مشبوه من خلال الضغط على زر الإبلاغ (🚩) المتاح
              على المنشورات والتعليقات والرسائل والملفات الشخصية. يتم مراجعة جميع البلاغات المتعلقة
              بسلامة الأطفال خلال 24 ساعة كحد أقصى، وتُعالَج الحالات العاجلة فورًا.
            </p>
            <p>
              للتواصل المباشر حول قضايا سلامة الأطفال:{' '}
              <a href="mailto:moayad.1420@gmail.com" className="text-primary-600 underline">
                moayad.1420@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">التعاون مع السلطات</h2>
            <p>
              نلتزم بالقوانين المعمول بها في المملكة العربية السعودية وبلدان التشغيل. نُبلّغ عن أي
              محتوى اعتداء جنسي على الأطفال إلى السلطات المحلية المعنية والمنظمات الدولية مثل NCMEC
              عند الاقتضاء، ونحتفظ بالأدلة المطلوبة قانونيًا للتحقيقات.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">جهة التواصل</h2>
            <p>
              المسؤول عن الامتثال:{' '}
              <a href="mailto:moayad.1420@gmail.com" className="text-primary-600 underline">
                moayad.1420@gmail.com
              </a>
            </p>
          </section>
        </div>
      </article>

      <hr className="my-8 border-gray-200" />

      {/* English */}
      <article dir="ltr">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Child Safety Standards</h1>
        <p className="text-xs text-gray-400 mb-6">Last updated: April 2026</p>

        <div className="prose prose-sm text-gray-700 space-y-4 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Our Commitment</h2>
            <p>
              Hai has a zero-tolerance policy toward child sexual abuse material (CSAM) and any
              content related to child sexual abuse or exploitation (CSAE). We are committed to
              protecting minors on our platform through effective prevention systems, easy reporting
              tools, and full cooperation with competent authorities.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Age Requirements</h2>
            <p>
              All users must be 13 years or older. Identity is verified through a real phone number
              confirmed by an OTP code. We reserve the right to immediately terminate any account
              found to belong to an underage user.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Prevention & Detection</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Automated review of posted visual content via intelligent filters</li>
              <li>In-app reporting available on every post, comment, profile, and message</li>
              <li>Human moderators reviewing reports around the clock</li>
              <li>Immediate automatic blocking upon detection of abusive content</li>
              <li>Permanent ban of repeat offenders</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Reporting</h2>
            <p>
              Any user can report suspicious content or behavior through the report button (🚩)
              available on posts, comments, messages, and profiles. All child-safety related
              reports are reviewed within 24 hours, and urgent cases are handled immediately.
            </p>
            <p>
              For direct contact regarding child safety matters:{' '}
              <a href="mailto:moayad.1420@gmail.com" className="text-primary-600 underline">
                moayad.1420@gmail.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Cooperation with Authorities</h2>
            <p>
              We comply with applicable laws in Saudi Arabia and other operating regions. We report
              any CSAM content to the relevant local authorities and international organizations
              such as NCMEC where applicable, and retain legally required evidence for
              investigations.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-800 mb-2">Point of Contact</h2>
            <p>
              Compliance officer:{' '}
              <a href="mailto:moayad.1420@gmail.com" className="text-primary-600 underline">
                moayad.1420@gmail.com
              </a>
            </p>
          </section>
        </div>
      </article>
    </main>
  )
}
