// 같은 데이터로 전후 비교 (극단값: 긴 이름, 큰 금액)
window.TRIP = {
  name: '제주 3박 4일', people: ['민지', '서준', '하윤', '김나라별빛여행자'],
  expenses: [
    { title: '숙소 2박', by: '민지', amount: 612000, with: 4 },
    { title: '렌터카', by: '서준', amount: 248000, with: 4 },
    { title: '흑돼지 저녁', by: '하윤', amount: 156400, with: 4 },
    { title: '기름값', by: '서준', amount: 71200, with: 4 },
    { title: '오름 앞 카페', by: '김나라별빛여행자', amount: 38500, with: 4 },
  ],
  transfers: [
    { from: '김나라별빛여행자', to: '민지', amount: 243025 },
    { from: '하윤', to: '민지', amount: 87450 },
    { from: '하윤', to: '서준', amount: 37675 },
  ],
};
window.won = (n) => n.toLocaleString('ko-KR') + '원';
