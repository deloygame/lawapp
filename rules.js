// School rules shown at registration, on the rules page and (once) to older accounts.
export const RULES = [
  ['Hörmət', 'Hər kəsə hörmətlə yanaşın. Təhqir, təhdid, ələ salma və kiberbulling (onlayn zorakılıq) qadağandır.'],
  ['Söyüş və nifrət', 'Söyüş, təhqiramiz sözlər, nifrət və ayrı-seçkilik çağırışları qadağandır.'],
  ['Şəxsi məlumatlar', 'Başqasının şəklini, telefonunu, ünvanını və digər məlumatlarını icazəsiz paylaşmayın. Öz məlumatlarınızı da hamıya açmayın.'],
  ['Uyğun məzmun', '18+, zorakılıq, narkotik, silah, təhlükəli və qanunsuz məzmunu paylaşmaq olmaz.'],
  ['Spam və yalan', 'Təkrarlanan mesajlar, zəncirvari mesajlar, reklam və yalan məlumat yaymaq olmaz.'],
  ['Anonim suallar', 'Anonimlik təhqir üçün deyil. Sui-istifadə halında administrasiya sualı göndərəni müəyyən edə və hesabı blok edə bilər.'],
  ['Həqiqi şəxsiyyət', 'Öz adınızdan istifadə edin, başqasının adından hesab açmayın. Bir şagird — bir hesab. Şifrənizi heç kimə verməyin.'],
  ['Şikayət və moderasiya', 'Pozuntu görsəniz 🚩 düyməsi ilə şikayət edin. Admin, müəllim və sinif nümayəndəsi məzmunu silə və pozuntu edənləri blok edə bilər.'],
  ['Məxfilik', 'Şəxsi yazışmalar uçdan-uca şifrələnir. Ümumi və sinif söhbətləri, paylaşımlar şifrələnmir və moderatorlar tərəfindən görünə bilər.'],
  ['Nəticələr', 'Qaydaları pozan istifadəçiyə xəbərdarlıq edilə, məzmunu silinə və hesabı müvəqqəti və ya həmişəlik bloklana bilər.']
];
export function renderRules(el) {
  el.textContent = '';
  const ol = document.createElement('ol');
  RULES.forEach(([t, d]) => { const li = document.createElement('li'), b = document.createElement('b'); b.textContent = t + '. '; li.append(b, d); ol.append(li); });
  el.append(ol);
}