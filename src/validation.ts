// Use the field labels from the Russian UI, rather than API property names.
const fieldLabels:Readonly<Record<string,string>>={
 hostname:'DNS-имя',
 zone_id:'Зона Cloudflare',
 ttl:'TTL новых записей, сек.',
 interval_seconds:'Интервал проверок, сек.',
 failure_threshold:'Порог исключения',
 recovery_threshold:'Порог восстановления',
 automation_enabled:'Автоматизация',
 ip:'Публичный IPv4',
 port:'Порт',
 uuid:'UUID пользователя VLESS',
 transport:'Транспорт',
 security:'Безопасность',
 server_name:'SNI / server name',
 public_key:'REALITY public key',
 short_id:'Short ID',
 fingerprint:'Fingerprint',
 flow:'Flow',
 path:'Путь XHTTP',
 host:'Host XHTTP',
 xhttp_mode:'Режим XHTTP',
 username:'Имя пользователя',
 password:'Пароль',
 cloudflare_api_token:'API Token (Cloudflare)',
 remnawave_url:'URL панели Remnawave',
 remnawave_api_token:'API Token (Remnawave)',
 bot_token:'Токен бота',
 chat_id:'Chat ID',
 enabled:'Уведомления Telegram',
 direct_enabled:'Проверять напрямую',
 socks5_enabled:'Проверять через SOCKS5',
};

export function validationMessage(detail:string,path:string):string {
 const match=/^Invalid request fields:\s*(.*)$/.exec(detail);
 if(!match)return detail;
 const endpoint=path.split(/[?#]/)[0];
 const labels:Readonly<Record<string,string>>={
  ...fieldLabels,
  name:/\/targets(?:\/|$)/.test(endpoint)?'Название узла':'Название пула',
  url:/^\/agents\/[^/]+\/proxy(?:\/|$)/.test(endpoint)?'Прокси':'Ссылка на подписку',
 };
 const fields=[...new Set(match[1].split(',').map(field=>field.trim()).filter(Boolean))];
 const known=fields.filter(field=>Object.hasOwn(labels,field));
 if(!known.length)return 'Проверьте правильность заполнения формы.';
 const names=known.map(field=>`«${labels[field]}»`).join(', ');
 const message=known.length===1?`Проверьте поле ${names}.`:`Проверьте поля: ${names}.`;
 return fields.length===known.length?message:`${message} Проверьте остальные данные формы.`;
}
