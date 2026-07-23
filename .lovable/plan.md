
# Phase C2 — Fixed Assets Management

يُقسم إلى **C2A / C2B / C2C** ويُصدَر كل قسم على وسم مستقل (`v2.2.a`, `v2.2.b`, `v2.2.c`) بنفس نمط B/C السابق: migration manifest + report + api-compat + tests + release notes.

---

## C2A — Foundation & Asset Registry
**Tag:** `v2.2.a-fixed-assets-registry`

### قاعدة البيانات
- `fixed_asset_categories` — شجرة (parent_id) + افتراضات (useful_life, method, salvage_%) + مفاتيح `account_determinations`:
  `fa.cost`, `fa.accumulated_depreciation`, `fa.depreciation_expense`, `fa.disposal_gain`, `fa.disposal_loss`, `fa.cip`, `fa.impairment_expense`, `fa.revaluation_surplus`.
- `fixed_asset_groups` — تجميعات إدارية (أسطول، أجهزة IT…) بدون تأثير محاسبي.
- `fixed_asset_templates` — قوالب سريعة (اسم، فئة، افتراضات، حقول مخصصة).
- `fixed_assets` — السجل الرئيسي؛ يشمل:
  - تعريف: `code` (متسلسل عبر `numbering_sequences`)، `barcode`, `qr_payload`, `rfid_tag`, `serial_number`, `manufacturer`, `model`, `warranty_from`, `warranty_to`.
  - ربط شراء: `supplier_party_id`, `purchase_order_id`, `bill_document_id`, `bill_line_id`, `ap_intake_document_id` (اختياري).
  - تنظيمي: `branch_id`, `department`, `cost_center_id`, `project_id`, `custodian_user_id`, `location_text`, `gps_lat`, `gps_lng`.
  - محاسبي: `category_id`, `acquisition_cost`, `residual_value`, `useful_life_months`, `method` (enum)، `in_service_date`, `status` (`draft|cip|active|held_for_sale|disposed|retired|written_off`)، `is_cip` bool، `parent_asset_id`، `is_component` bool.
- `fixed_asset_components` — رابط والد/مكوّن مع نسبة/قيمة.
- `fixed_asset_custom_fields` — JSONB على المستوى المؤسسي (تعريف الحقول) + `fixed_assets.custom` JSONB.
- كل الجداول: GRANT قبل RLS + سياسات على `has_org_role` (viewer/editor/admin) + `updated_at` trigger + `financial_audit_log` عبر trigger.

### الخادم/الواجهة
- `src/lib/fixed-assets/registry.functions.ts`: CRUD + استيراد CSV + توليد باركود/QR + `capitalize_from_bill(bill_id, lines[])` (يستخدم `posting_events` — بدون ترحيل إهلاك بعد).
- `/assets` (السجل)، `/assets/$id` (تفاصيل + تبويبات: Overview / Components / Documents / Custom)، `/assets/new`، `/settings/asset-categories`، `/settings/asset-templates`.
- طباعة ملصق باركود/QR (نفس محرك `printDoc`).
- Feature flag: `fixed_assets` (افتراضي off حتى C2B).

### تكامل هذه الدفعة
- **AP Automation:** زر "رسملة إلى أصل" داخل `purchases.ap-review.tsx` وحيث يعرض bill.
- **Numbering, Audit, Approvals, Attachments, Notifications:** إعادة استخدام المحركات القائمة.

**تسليم C2A:** لا يوجد إهلاك بعد؛ فقط سجل + رسملة + ربط.

---

## C2B — Depreciation Engine
**Tag:** `v2.2.b-fixed-assets-depreciation`

### قاعدة البيانات
- `fixed_asset_schedules` — سطر لكل (asset, period): `period_start/end`, `days`, `opening_nbv`, `depreciation`, `accumulated`, `closing_nbv`, `posted_journal_id`, `status` (`planned|posted|reversed`).
- `fixed_asset_runs` — دورة إهلاك (org, period, method_snapshot, totals, status, journal_id, created_by).
- `fixed_asset_method_params` — لكل أصل (units of production: `total_units`, `units_this_period`; DDB: `factor`؛ manual overrides).
- `fixed_asset_conventions` — سياسة المؤسسة (`mid_month`, `mid_quarter`, `daily`, `full_month`) + `fiscal_year_id` ربط.

### المحرك (Postgres + خادم)
- SQL functions atomic:
  - `preview_depreciation(_org, _period, _method_filter default null)` — يُرجع الجدول قبل الترحيل.
  - `post_depreciation_run(_org, _period)` — يُنشئ JE واحد مجمّع لكل فئة/CC عبر `posting_events` باستخدام مفاتيح `account_determinations` — ذرّي (savepoint).
  - `reverse_depreciation_run(_run_id)` — يعكس ويحدّث الجداول.
  - `recalculate_asset(_asset_id)` — بعد تعديل التكلفة/العمر/الطريقة → يحسب Catch-up ويقيّده في الفترة الحالية.
- طرق مدعومة: `straight_line`, `declining_balance`, `double_declining`, `units_of_production`, `manual` + Partial Periods + Mid-month/Mid-quarter + Daily/Monthly/Yearly.
- Health check جديد: `fa.depreciation_gap` (فترات مفتوحة بلا ترحيل)؛ ويُمنع إغلاق الفترة قبل ترحيل الإهلاك.

### الواجهة
- `/assets/depreciation` — تشغيل الدورة: اختيار الفترة → Preview grid (فلترة بالفئة/الفرع) → Post → Reverse.
- تبويب "Schedule" في صفحة الأصل: جدول عمري كامل + مؤشر بصري NBV.
- Budget hook: مقارنة الإهلاك الفعلي مقابل الميزانية (ربط مع `budgets` من C3 لاحقًا — واجهة محضّرة).

**تسليم C2B:** إهلاك دقيق مرحّل، مع Catch-up و Reverse، وربط period-close.

---

## C2C — Lifecycle, Timeline & Copilot Intelligence
**Tag:** `v2.2.c-fixed-assets-intelligence`

### الأحداث والدورة
- `fixed_asset_events` — نوع + payload JSONB لكل من:
  `acquisition, capitalization (from CIP), improvement, transfer (branch/CC/custodian), split, merge, revaluation, impairment, maintenance, disposal, sale, retirement, write_off`.
- RPCs لكل حدث تُنشئ JE عبر مفاتيح التحديد وتُحدّث الأصل والجداول:
  - `improve_asset` (يزيد التكلفة ويعيد حساب الجدول تلقائيًا).
  - `transfer_asset` (بلا JE ما لم يتغيّر CC/فرع مع سياسة inter-branch).
  - `split_asset` / `merge_assets` (تكلفة/إهلاك نسبيًا).
  - `revalue_asset` (فائض إعادة تقييم في حقوق الملكية).
  - `impair_asset` (مصروف اضمحلال).
  - `dispose_asset(sale_price?, method)` (يقارن NBV → gain/loss).
- سجل الصيانة: `fixed_asset_maintenance` (تكلفة، مورد، نوع: preventive/corrective، مرفقات، حالة).

### Asset Timeline موحّد
- View `asset_timeline` يجمع من: `fixed_asset_events` + `depreciation_schedules(posted)` + `attachments` + `financial_audit_log` + bill/PO المرتبط + الصيانة.
- مكون `AssetTimeline.tsx` (نمط `DocumentSidePanel`) داخل `/assets/$id`.
- استعلامات Copilot جاهزة:
  - "لماذا انخفضت القيمة الدفترية لهذا الأصل؟" → يشرح آخر أحداث + جدول الإهلاك + اضمحلال إن وُجد.
  - "اعرض كل أحداث هذا الأصل منذ الشراء."

### AI Copilot Actions (تمديد C1.3)
`src/lib/copilot/asset-actions.functions.ts` بنفس نمط `copilot_action_proposals`:
- `classify_asset` — من وصف/فاتورة → فئة + عمر + طريقة + مفاتيح GL مقترحة (مع Explainability).
- `propose_useful_life` / `propose_method` / `propose_gl_mapping` — قرارات مستقلة مسجّلة في `ai_copilot_decisions`.
- `detect_duplicate_assets` — تشابه (serial/model/supplier/cost/date).
- `detect_idle_assets` — لا حركة صيانة/استخدام (units of production = 0) لفترة مُعرَّفة.
- `suggest_replacement` — تكلفة الصيانة السنوية ÷ NBV مقابل سعر الاستبدال المتوقّع (input من المستخدم أو AI web-lookup).
- `maintenance_vs_replace` — تحليل NPV مبسّط + توصية.
كل إجراء يُقترح كـ `ActionProposal` — لا تنفيذ إلا بموافقة (نفس UI الحالي).

### التكامل الكامل مع الوحدات
- **Procurement (PO):** رسملة سطر PO مباشرة أو عبر bill.
- **Inventory:** تحويل صنف مخزون إلى أصل ثابت (خصم من المخزون + JE + Asset جديد).
- **AP Automation:** اقتراح "هل هذا أصل؟" داخل `ap-review` عندما يكتشف Copilot معدات/تكلفة > حد الرسملة.
- **Journal Engine:** كل شيء عبر `posting_events` + `account_determinations` (لا حساب مضمّن).
- **Budget:** ربط الإهلاك و CAPEX بحسابات الميزانية (interface hook, wired in C3).
- **Notifications:** انتهاء الضمان، Custodian change، تجاوز حد الصيانة، فشل ترحيل الإهلاك.
- **Approval Engine:** disposal/impairment/revaluation تمرّ عبر workflow قابل للتهيئة.
- **Audit Log:** كل RPC يكتب `financial_audit_log`.
- **Feature Flags:** `fixed_assets.depreciation`, `fixed_assets.ai`, `fixed_assets.timeline` — إطلاق تدريجي.

### الاختبارات والوثائق
- E2E: acquire → improve → transfer → depreciate 3 months → impair → dispose (JE balanced في كل خطوة).
- Perf: 10k أصل × 60 شهر جدول.
- تقارير: `docs/PHASE_C2A_REPORT.md`, `PHASE_C2B_REPORT.md`, `PHASE_C2C_REPORT.md` + `PHASE_C2_MIGRATION_MANIFEST.md` + `PHASE_C2_API_COMPAT.md`.

---

## قبل البدء — أحتاج تأكيدك على:

1. **حد الرسملة (Capitalization Threshold):** رقم افتراضي (مثلاً 2000 ريال) قابل للتعديل من `settings.accounting-foundation`؟
2. **Convention افتراضي:** Mid-month أم Full-month لأول شهر خدمة؟
3. **إعادة التقييم:** IFRS (فائض في حقوق الملكية) هو الافتراضي — أم Cost model فقط؟
4. **CIP:** هل تريد صفحة مستقلة `/assets/cip` لتجميع تكاليف الإنشاء قبل التشغيل، أم تبويب داخل صفحة الأصل يكفي؟

بمجرد إجابتك، أبدأ **C2A** فورًا بـ migration + registry + رسملة من الفاتورة.
