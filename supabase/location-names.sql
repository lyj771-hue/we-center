-- 오시는길 센터 이름을 캔버스와 맞춤: 은평구 수색 센터 → We 수색 센터, 의정부 센터 → We 의정부 센터
update location_info
set content = replace(replace(content, '"name": "은평구 수색 센터"', '"name": "We 수색 센터"'), '"name": "의정부 센터"', '"name": "We 의정부 센터"');
