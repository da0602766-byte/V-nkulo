// Date-only arithmetic avoids device timezone and daylight-saving shifts.
export function visitorBirthdayInYear(birth:string,today:string){
  const valid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  if(!valid(birth)||!valid(today)||birth>today)return null;
  const year=Number(today.slice(0,4)),month=Number(birth.slice(5,7)),day=Number(birth.slice(8));
  const observedDay=Math.min(day,new Date(Date.UTC(year,month,0)).getUTCDate());
  const days=Math.round((Date.UTC(year,month-1,observedDay)-Date.parse(today+'T00:00:00Z'))/86400000);
  const label=days===0?'Hoje é o aniversário':days===1?'Amanhã · falta 1 dia':days>1?`Faltam ${days} dias`:days===-1?'Foi ontem':`Foi há ${-days} dias`;
  return {days,label,age:year-Number(birth.slice(0,4)),adjusted:observedDay!==day};
}
