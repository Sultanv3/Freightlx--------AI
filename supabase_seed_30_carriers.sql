-- ═══════════════════════════════════════════════════════════════
--   FREIGHTLX: Seed 30 Top Global Shipping Lines
--   Run AFTER supabase_schema_v2.sql
-- ═══════════════════════════════════════════════════════════════

-- Insert/update all 30 carriers with full brand info
insert into public.carriers (code, name, country, brand_color, transit_days_avg, services, priority, website, logo_url, description_ar, active)
values
  ('MSCU', 'Mediterranean Shipping Company', 'Switzerland', '#F39200', 21, array['FCL','LCL','Reefer']::text[], 1, 'https://www.msc.com', '/assets/carriers/msc.svg', 'إم إس سي — سويسرا', true),
  ('MAEU', 'A.P. Moller-Maersk', 'Denmark', '#42B0D5', 22, array['FCL','LCL','Reefer','OOG']::text[], 2, 'https://www.maersk.com', '/assets/carriers/maersk.svg', 'ميرسك — الدنمارك', true),
  ('CMDU', 'CMA CGM Group', 'France', '#E40521', 24, array['FCL','LCL','Reefer']::text[], 3, 'https://www.cma-cgm.com', '/assets/carriers/cma-cgm.svg', 'سي إم إيه سي جي إم — فرنسا', true),
  ('CSCO', 'COSCO Shipping Lines', 'China', '#003D7A', 23, array['FCL','LCL','Reefer']::text[], 4, 'https://www.coscoshipping.com', '/assets/carriers/cosco.svg', 'كوسكو — الصين', true),
  ('HLCU', 'Hapag-Lloyd AG', 'Germany', '#FF6900', 22, array['FCL','LCL','Reefer']::text[], 5, 'https://www.hapag-lloyd.com', '/assets/carriers/hapag-lloyd.svg', 'هاباغ لويد — ألمانيا', true),
  ('EGLV', 'Evergreen Marine', 'Taiwan', '#3DA935', 24, array['FCL','LCL']::text[], 6, 'https://www.evergreen-marine.com', '/assets/carriers/evergreen.svg', 'إيفرغرين — تايوان', true),
  ('ONEY', 'Ocean Network Express', 'Japan', '#FF1493', 23, array['FCL','LCL','Reefer']::text[], 7, 'https://www.one-line.com', '/assets/carriers/one.svg', 'أوشن نتورك إكسبرس — اليابان', true),
  ('HDMU', 'HMM Co., Ltd', 'South Korea', '#0F4C81', 24, array['FCL','LCL']::text[], 8, 'https://www.hmm21.com', '/assets/carriers/hmm.svg', 'إتش إم إم — كوريا الجنوبية', true),
  ('YMLU', 'Yang Ming Marine Transport', 'Taiwan', '#D91414', 24, array['FCL','LCL']::text[], 9, 'https://www.yangming.com', '/assets/carriers/yang-ming.svg', 'يانغ مينغ — تايوان', true),
  ('ZIMU', 'ZIM Integrated Shipping Services', 'Israel', '#F58220', 25, array['FCL','Reefer']::text[], 10, 'https://www.zim.com', '/assets/carriers/zim.svg', 'زيم — إسرائيل', true),
  ('WHLC', 'Wan Hai Lines', 'Taiwan', '#CC0000', 26, array['FCL','LCL']::text[], 11, 'https://www.wanhai.com', '/assets/carriers/wan-hai.svg', 'وان هاي — تايوان', true),
  ('PILU', 'Pacific International Lines', 'Singapore', '#1A5DAA', 25, array['FCL','LCL']::text[], 12, 'https://www.pilship.com', '/assets/carriers/pil.svg', 'باسيفك إنترناشيونال — سنغافورة', true),
  ('KMTU', 'Korea Marine Transport Co', 'South Korea', '#005EB8', 26, array['FCL','LCL']::text[], 13, 'https://www.ekmtc.com', '/assets/carriers/kmtc.svg', 'كي إم تي سي — كوريا الجنوبية', true),
  ('SMLU', 'SM Line Corporation', 'South Korea', '#003E7E', 27, array['FCL']::text[], 14, 'https://www.smlines.com', '/assets/carriers/sm-line.svg', 'إس إم لاين — كوريا الجنوبية', true),
  ('OOLU', 'Orient Overseas Container Line', 'Hong Kong', '#E2231A', 23, array['FCL','LCL','Reefer']::text[], 15, 'https://www.oocl.com', '/assets/carriers/oocl.svg', 'أو أو سي إل — هونغ كونغ', true),
  ('SITU', 'SITC International Holdings', 'China', '#003F7F', 24, array['FCL','LCL']::text[], 16, 'https://www.sitc.com', '/assets/carriers/sitc.svg', 'إس آي تي سي — الصين', true),
  ('XPRS', 'X-Press Feeders', 'Singapore', '#0E2C5C', 25, array['FCL']::text[], 17, 'https://www.x-pressfeeders.com', '/assets/carriers/x-press.svg', 'إكس بريس فيدرز — سنغافورة', true),
  ('RCLU', 'Regional Container Lines', 'Thailand', '#003D7A', 26, array['FCL']::text[], 18, 'https://www.rclgroup.com', '/assets/carriers/rcl.svg', 'أر سي إل — تايلاند', true),
  ('TSLU', 'TS Lines Co. Ltd', 'Taiwan', '#004E8C', 26, array['FCL']::text[], 19, 'https://www.tslines.com', '/assets/carriers/ts-lines.svg', 'تي إس لاينز — تايوان', true),
  ('MATS', 'Matson Navigation Co.', 'USA', '#0066A0', 21, array['FCL','LCL']::text[], 20, 'https://www.matson.com', '/assets/carriers/matson.svg', 'ماتسون — الولايات المتحدة', true),
  ('SKLU', 'Sinokor Merchant Marine', 'South Korea', '#003366', 27, array['FCL']::text[], 21, 'https://www.sinokor.co.kr', '/assets/carriers/sinokor.svg', 'سينوكور — كوريا الجنوبية', true),
  ('APLU', 'American President Lines', 'Singapore', '#003B71', 24, array['FCL','LCL']::text[], 22, 'https://www.apl.com', '/assets/carriers/apl.svg', 'إيه بي إل — سنغافورة', true),
  ('HASL', 'Heung-A Line', 'South Korea', '#0066B3', 27, array['FCL']::text[], 23, 'https://www.heung-a.com', '/assets/carriers/heung-a.svg', 'هيونغ آه — كوريا الجنوبية', true),
  ('SEAU', 'Sealand — A Maersk Company', 'USA', '#1B365D', 22, array['FCL','LCL']::text[], 24, 'https://www.sealandmaersk.com', '/assets/carriers/sealand.svg', 'سي لاند — الولايات المتحدة', true),
  ('ARKU', 'Arkas Line', 'Turkey', '#003F87', 26, array['FCL','LCL']::text[], 25, 'https://www.arkasline.com.tr', '/assets/carriers/arkas.svg', 'أركاس — تركيا', true),
  ('ESLU', 'Emirates Shipping Line', 'UAE', '#C8102E', 23, array['FCL']::text[], 26, 'https://www.emiratesline.com', '/assets/carriers/emirates-sl.svg', 'الإمارات للشحن — الإمارات', true),
  ('CULU', 'China United Lines', 'China', '#C8102E', 26, array['FCL']::text[], 27, 'https://www.culines.com', '/assets/carriers/cu-lines.svg', 'سي يو لاينز — الصين', true),
  ('SWIR', 'Swire Shipping', 'Hong Kong', '#005EB8', 28, array['FCL','Bulk']::text[], 28, 'https://www.swireshipping.com', '/assets/carriers/swire.svg', 'سواير — هونغ كونغ', true),
  ('CROW', 'Crowley Maritime', 'USA', '#003B71', 22, array['FCL']::text[], 29, 'https://www.crowley.com', '/assets/carriers/crowley.svg', 'كراولي — الولايات المتحدة', true),
  ('ANCH', 'Antong Holdings (QASC)', 'China', '#003366', 26, array['FCL']::text[], 30, 'https://www.qasc.com.cn', '/assets/carriers/antong.svg', 'أنتونغ — الصين', true)
on conflict (code) do update set
  name             = excluded.name,
  country          = excluded.country,
  brand_color      = excluded.brand_color,
  transit_days_avg = excluded.transit_days_avg,
  services         = excluded.services,
  priority         = excluded.priority,
  website          = excluded.website,
  logo_url         = excluded.logo_url,
  description_ar   = excluded.description_ar,
  active           = true,
  updated_at       = now();

-- Verify count + sample
select count(*) as total_carriers from public.carriers where active = true;
select code, name, priority, brand_color, transit_days_avg, logo_url, country
from public.carriers
order by priority asc
limit 10;
