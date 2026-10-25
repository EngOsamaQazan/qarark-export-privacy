# نشر إضافة تصدير تشريعات قرارك

آخر تحديث: 2026-10-25  
الحالة: جاهزة للرفع بعد وضع رابط سياسة الخصوصية ولقطة شاشة.

الحزمة الجاهزة للرفع (فيها `manifest.json` في الجذر، ومن دون ملفات التطوير):

`C:\Users\pc\Desktop\قوانين\تصدير-تشريعات-قرارك-1.0.0.zip`

## الحساب

1. ادخل إلى [لوحة مطوري متجر كروم](https://chrome.google.com/webstore/devconsole).
2. سجّل حساب مطوّر. الرسوم مرة واحدة: 5 دولارات.
3. New item، ثم ارفع ملف zip أعلاه.
4. بعد الموافقة يظهر رابط التثبيت للعموم، أو رابط خاص إذا اخترت Unlisted.

المراجعة غالباً تستغرق أياماً. الإضافة الجديدة قد تُراجع أطول.

## بيانات المتجر

انسخ هذه الحقول كما هي.

| الحقل | النص |
|---|---|
| اللغة | Arabic |
| الاسم | تصدير التشريع إلى وورد |
| الوصف المختصر | تصدير نص التشريع المعروض في قرارك إلى ملف وورد منسق. إضافة غير رسمية. |
| الفئة | Productivity |

### الوصف التفصيلي

```
تصدّر نص التشريع الذي تفتحه في موقع قرارك إلى ملف وورد عربي منسق.

عندما تضغط أيقونة الإضافة تظهر لوحة جانبية. يمكنك تصدير القانون كاملاً حتى لو كانت الصفحة تعرض مادة واحدة، أو تصدير النص الظاهر فقط. يُحفظ الملف في مجلد التنزيلات.

الملف من اليمين إلى اليسار، ويضم عنوان القانون وأرقام المواد ونصها والجداول والقوائم. المواد الملغاة تظهر بخط مائل.

الإضافة تعمل فقط على صفحات التشريع في qarark.com بعد تسجيل دخولك إلى الموقع. لا ترسل النص إلى أي خادم، ولا تجمع حسابات أو تحليلات.

هذه الإضافة غير تابعة لموقع قرارك وغير معتمدة منه.
```

## لقطة الشاشة

مطلوبة لقطة واحدة على الأقل بمقاس 1280×800 أو 640×400.

افتح تشريعاً في قرارك، افتح اللوحة الجانبية، ثم صوّر النافذة. لا تُظهر بيانات شخصية في الصورة.

## الصلاحيات

اكتب كل سطر في خانة تبرير الصلاحية المقابلة. الصياغة بالإنجليزية لأن فريق المراجعة يقرأها.

**tabs**  
The side panel reads the active tab URL to decide whether the user is on a qarark.com legislation page and to show that law’s title. It is not used to track browsing history.

**scripting**  
When the user clicks the export button, the extension injects a script into that open qarark tab to read the legislation text already displayed on the page.

**downloads**  
The generated Word file is saved to the user’s Downloads folder. Nothing else is downloaded.

**sidePanel**  
The export controls are shown in Chrome’s side panel after the user clicks the extension icon.

**https://www.qarark.com/\* and https://qarark.com/\***  
Used only after the user clicks export, and only on the legislation page they already opened. The extension reads that page and, if they chose the full law, requests the same law’s stacked text from qarark.com. No other sites are accessed.

## الخصوصية

في نموذج Privacy practices:

- الغرض الواحد: Export the legislation text open on qarark.com into a formatted Word file saved on the user’s device.
- Website content: نعم، يُقرأ نص الصفحة محلياً.
- لا يُرسل النص خارج الجهاز.
- لا حسابات، ولا إعلانات، ولا بيع للبيانات، ولا تحليلات.
- ضع هذا السطر في الوصف وفي الملاحظات: This extension is not affiliated with or endorsed by Qarark.

سياسة الخصوصية يجب أن تكون رابطاً عاماً يعمل في المتصفح، لا ملفاً داخل الإضافة. النص الجاهز في:

`C:\Users\pc\Desktop\قوانين\qarark-word-export\privacy-policy.html`

انشر هذا الملف عبر Google Sites أو أي استضافة، ثم الصق الرابط في خانة Privacy policy.

## ما لا يُرفع

لا تضمّن في الـ zip مجلد `.git` ولا `node_modules` ولا ملفات `.env` ولا هذا الملف. الحزمة المجهزة أعلاه تستثنيها، وتستثني أيضاً `icons/make-icons.js`.
