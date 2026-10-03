// Built-in common foods, searchable offline in English and Albanian. Values per
// 100 g (or 100 ml for drinks), from USDA FoodData Central reference data
// (public domain), rounded; Albanian dishes are typical estimates (flagged).
// null = not known — never zero. A food is saved to "My foods" when first logged.
import { emptyNutrients, type FoodDraft } from './nutrition'
import { normalizeName } from './recents'

//            id            name                   aliases (Albanian etc.)       kcal  P     C     F     fib   sug   sat   Na(mg) servings "label:g|…"         extra
type Row = [string, string, string, number, number, number, number, number | null, number | null, number | null, number | null, string, { ml?: true; caf?: number; est?: true }?]

const ROWS: Row[] = [
  // Fruit
  ['banana', 'Banana', 'banane', 89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.1, 1, '1 medium:118'],
  ['apple', 'Apple', 'mollë molle', 52, 0.3, 13.8, 0.2, 2.4, 10.4, 0, 1, '1 medium:182'],
  ['orange', 'Orange', 'portokall', 47, 0.9, 11.8, 0.1, 2.4, 9.4, 0, 0, '1 medium:131'],
  ['mandarin', 'Mandarin', 'mandarinë', 53, 0.8, 13.3, 0.3, 1.8, 10.6, 0, 2, '1 fruit:88'],
  ['pear', 'Pear', 'dardhë', 57, 0.4, 15.2, 0.1, 3.1, 9.8, 0, 1, '1 medium:178'],
  ['grapes', 'Grapes', 'rrush', 69, 0.7, 18.1, 0.2, 0.9, 15.5, 0.1, 2, '1 cup:151'],
  ['strawberries', 'Strawberries', 'luleshtrydhe dredhëza', 32, 0.7, 7.7, 0.3, 2, 4.9, 0, 1, '1 cup:152'],
  ['watermelon', 'Watermelon', 'shalqi', 30, 0.6, 7.6, 0.2, 0.4, 6.2, 0, 1, '1 slice:280'],
  ['melon', 'Melon', 'pjepër', 34, 0.8, 8.2, 0.2, 0.9, 7.9, 0, 16, '1 slice:160'],
  ['peach', 'Peach', 'pjeshkë', 39, 0.9, 9.5, 0.3, 1.5, 8.4, 0, 0, '1 medium:150'],
  ['apricot', 'Apricot', 'kajsi', 48, 1.4, 11.1, 0.4, 2, 9.2, 0, 1, '1 fruit:35'],
  ['plum', 'Plum', 'kumbull', 46, 0.7, 11.4, 0.3, 1.4, 9.9, 0, 0, '1 plum:66'],
  ['cherries', 'Cherries', 'qershi', 63, 1.1, 16, 0.2, 2.1, 12.8, 0, 0, '1 cup:138'],
  ['figs', 'Figs (fresh)', 'fiq', 74, 0.8, 19.2, 0.3, 2.9, 16.3, 0.1, 1, '1 fig:50'],
  ['kiwi', 'Kiwi', 'kivi', 61, 1.1, 14.7, 0.5, 3, 9, 0, 3, '1 fruit:69'],
  ['pomegranate', 'Pomegranate', 'shegë', 83, 1.7, 18.7, 1.2, 4, 13.7, 0.1, 3, '1 cup seeds:174'],
  ['mango', 'Mango', 'mango', 60, 0.8, 15, 0.4, 1.6, 13.7, 0.1, 1, '1 cup:165'],
  ['pineapple', 'Pineapple', 'ananas', 50, 0.5, 13.1, 0.1, 1.4, 9.9, 0, 1, '1 cup:165'],
  ['lemon', 'Lemon', 'limon', 29, 1.1, 9.3, 0.3, 2.8, 2.5, 0, 2, '1 fruit:58'],
  ['avocado', 'Avocado', 'avokado', 160, 2, 8.5, 14.7, 6.7, 0.7, 2.1, 7, 'Half:100'],
  ['dates', 'Dates', 'hurma', 282, 2.5, 75, 0.4, 8, 63, 0, 2, '1 date:8'],
  ['raisins', 'Raisins', 'rrush i thatë', 299, 3.1, 79, 0.5, 3.7, 59, 0.1, 11, 'Handful:30'],
  // Vegetables
  ['tomato', 'Tomato', 'domate', 18, 0.9, 3.9, 0.2, 1.2, 2.6, 0, 5, '1 medium:123'],
  ['cucumber', 'Cucumber', 'kastravec', 15, 0.7, 3.6, 0.1, 0.5, 1.7, 0, 2, '1 medium:200'],
  ['lettuce', 'Lettuce', 'sallatë jeshile marule', 15, 1.4, 2.9, 0.2, 1.3, 0.8, 0, 28, '1 cup:50'],
  ['carrot', 'Carrot', 'karotë', 41, 0.9, 9.6, 0.2, 2.8, 4.7, 0, 69, '1 medium:61'],
  ['onion', 'Onion', 'qepë', 40, 1.1, 9.3, 0.1, 1.7, 4.2, 0, 4, '1 medium:110'],
  ['bell-pepper', 'Bell pepper', 'spec', 31, 1, 6, 0.3, 2.1, 4.2, 0, 4, '1 medium:119'],
  ['spinach', 'Spinach', 'spinaq', 23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.1, 79, '1 cup:30'],
  ['broccoli', 'Broccoli', 'brokoli', 34, 2.8, 6.6, 0.4, 2.6, 1.7, 0, 33, '1 cup:91'],
  ['zucchini', 'Zucchini', 'kungulleshë', 17, 1.2, 3.1, 0.3, 1, 2.5, 0.1, 8, '1 medium:196'],
  ['eggplant', 'Eggplant', 'patëllxhan', 25, 1, 5.9, 0.2, 3, 3.5, 0, 2, '1 cup:82'],
  ['mushrooms', 'Mushrooms', 'kërpudha', 22, 3.1, 3.3, 0.3, 1, 2, 0, 5, '1 cup:70'],
  ['cabbage', 'Cabbage', 'lakër', 25, 1.3, 5.8, 0.1, 2.5, 3.2, 0, 18, '1 cup:89'],
  ['green-beans', 'Green beans', 'fasule të njoma bishtaja', 31, 1.8, 7, 0.2, 2.7, 3.3, 0, 6, '1 cup:110'],
  ['sweetcorn', 'Sweetcorn', 'misër', 86, 3.3, 19, 1.4, 2.7, 6.3, 0.3, 15, '1 cup:145'],
  ['potato', 'Potato (boiled)', 'patate', 87, 1.9, 20.1, 0.1, 1.8, 0.9, 0, 4, '1 medium:173'],
  ['fries', 'French fries', 'patate të skuqura', 312, 3.4, 41, 15, 3.8, 0.3, 2.3, 210, 'Portion:117'],
  ['olives-green', 'Green olives', 'ullinj', 145, 1, 3.8, 15.3, 3.3, 0.5, 2, 1556, '10 olives:40'],
  ['olives-black', 'Black olives', 'ullinj të zinj', 115, 0.8, 6.3, 10.7, 3.2, 0, 1.4, 735, '10 olives:40'],
  // Bread, grains, pasta
  ['bread-white', 'White bread', 'bukë', 265, 9, 49, 3.2, 2.7, 5, 0.7, 491, '1 slice:30'],
  ['bread-wholewheat', 'Whole-wheat bread', 'bukë integrale', 252, 12.4, 42.7, 3.5, 6, 4.4, 0.7, 450, '1 slice:32'],
  ['pita', 'Pita bread', 'pite pita', 275, 9.1, 55.7, 1.2, 2.2, 1.3, 0.2, 536, '1 pita:60'],
  ['tortilla', 'Wheat tortilla', 'tortilja', 312, 8, 52, 8, 3.5, 2, 2.9, 600, '1 tortilla:45'],
  ['croissant', 'Croissant', 'kroasant', 406, 8.2, 45.8, 21, 2.6, 11.3, 11.7, 467, '1 croissant:57'],
  ['rice-white', 'White rice (cooked)', 'oriz', 130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.1, 1, '1 cup:158'],
  ['rice-brown', 'Brown rice (cooked)', 'oriz integral', 123, 2.7, 25.6, 1, 1.6, 0.2, 0.3, 4, '1 cup:195'],
  ['pasta', 'Pasta (cooked)', 'makarona shpageti', 158, 5.8, 30.9, 0.9, 1.8, 0.6, 0.2, 1, '1 plate:220'],
  ['couscous', 'Couscous (cooked)', 'kuskus', 112, 3.8, 23.2, 0.2, 1.4, 0.1, 0, 5, '1 cup:157'],
  ['quinoa', 'Quinoa (cooked)', 'kinoa', 120, 4.4, 21.3, 1.9, 2.8, 0.9, 0.2, 7, '1 cup:185'],
  ['oats', 'Oats (dry)', 'tërshërë', 389, 16.9, 66.3, 6.9, 10.6, 1, 1.2, 2, 'Bowl:40'],
  ['cornflakes', 'Cornflakes', 'drithëra', 357, 7.5, 84, 0.4, 3.3, 9.5, 0.1, 729, 'Bowl:30'],
  ['pizza', 'Pizza (cheese)', 'pica picë', 266, 11.4, 33.3, 9.7, 2.3, 3.6, 4.5, 598, '1 slice:107'],
  // Meat, fish, eggs, legumes
  ['chicken-breast', 'Chicken breast (cooked)', 'pulë gjoks pule', 165, 31, 0, 3.6, 0, 0, 1, 74, 'Portion:150'],
  ['chicken-thigh', 'Chicken thigh (cooked)', 'pulë kofshë pule', 209, 26, 0, 10.9, 0, 0, 3, 84, '1 thigh:100'],
  ['beef-mince', 'Beef mince (cooked)', 'mish i grirë viçi', 250, 26, 0, 15, 0, 0, 5.9, 72, 'Portion:150'],
  ['beef-steak', 'Beef steak (cooked)', 'biftek viç', 271, 25, 0, 19, 0, 0, 7.7, 55, 'Steak:200'],
  ['pork-chop', 'Pork chop (cooked)', 'mish derri bërxollë', 231, 24, 0, 14, 0, 0, 5, 62, '1 chop:150'],
  ['lamb', 'Lamb (cooked)', 'mish qengji qengj', 294, 25.6, 0, 20.9, 0, 0, 8.8, 72, 'Portion:150'],
  ['salmon', 'Salmon (cooked)', 'salmon peshk', 206, 22, 0, 12.4, 0, 0, 2.5, 61, 'Fillet:150'],
  ['sea-bass', 'Sea bass (cooked)', 'levrek peshk', 124, 23.6, 0, 2.6, 0, 0, 0.7, 87, 'Fillet:150'],
  ['tuna-water', 'Tuna in water', 'ton', 116, 25.5, 0, 0.8, 0, 0, 0.2, 247, '1 can:120'],
  ['tuna-oil', 'Tuna in oil', 'ton në vaj', 198, 29, 0, 8.2, 0, 0, 1.5, 354, '1 can:120'],
  ['sardines', 'Sardines (canned)', 'sardele', 208, 24.6, 0, 11.5, 0, 0, 1.5, 307, '1 can:92'],
  ['shrimp', 'Shrimp (cooked)', 'karkaleca', 99, 24, 0.2, 0.3, 0, 0, 0.1, 111, 'Portion:100'],
  ['egg-boiled', 'Egg (boiled)', 'vezë e zier', 155, 12.6, 1.1, 10.6, 0, 1.1, 3.3, 124, '1 egg:50'],
  ['egg-fried', 'Egg (fried)', 'vezë e skuqur sy', 196, 13.6, 0.8, 14.8, 0, 0.4, 4.3, 207, '1 egg:46'],
  ['ham', 'Ham', 'proshutë sallam', 145, 21, 1.5, 5.5, 0, 1.3, 1.8, 1203, '2 slices:40'],
  ['salami', 'Salami', 'sallam', 336, 22, 1, 26, 0, 1, 9.3, 1500, '5 slices:30'],
  ['sausage', 'Sausage (cooked)', 'suxhuk salsiçe', 301, 12, 2, 27, 0, 1, 9.4, 800, '1 sausage:75'],
  ['lentils', 'Lentils (cooked)', 'thjerrëza', 116, 9, 20.1, 0.4, 7.9, 1.8, 0.1, 2, '1 cup:198'],
  ['white-beans', 'White beans (cooked)', 'fasule', 139, 9.7, 25, 0.4, 6.3, 0.3, 0.1, 6, '1 cup:179'],
  ['chickpeas', 'Chickpeas (cooked)', 'qiqra', 164, 8.9, 27.4, 2.6, 7.6, 4.8, 0.3, 7, '1 cup:164'],
  ['hummus', 'Hummus', 'humus', 166, 7.9, 14.3, 9.6, 6, 0.3, 1.4, 379, '2 tbsp:30'],
  ['tofu', 'Tofu', 'tofu', 76, 8, 1.9, 4.8, 0.3, 0.6, 0.7, 7, 'Portion:100'],
  // Dairy
  ['milk-whole', 'Milk (whole)', 'qumësht', 61, 3.2, 4.8, 3.3, 0, 5.1, 1.9, 43, '1 glass:250', { ml: true }],
  ['milk-semi', 'Milk (semi-skimmed)', 'qumësht 2%', 50, 3.3, 4.8, 2, 0, 5.1, 1.3, 47, '1 glass:250', { ml: true }],
  ['yogurt', 'Yogurt (plain)', 'kos', 61, 3.5, 4.7, 3.3, 0, 4.7, 2.1, 46, '1 pot:200'],
  ['greek-yogurt', 'Greek yogurt (plain)', 'kos grek', 97, 9, 4, 5, 0, 4, 3.3, 35, '1 pot:170'],
  ['white-cheese', 'White cheese (feta)', 'djathë i bardhë feta', 264, 14.2, 4.1, 21.3, 0, 4.1, 14.9, 1116, 'Slice:30'],
  ['kashkaval', 'Kashkaval', 'kaçkavall', 350, 25, 2, 28, 0, null, 17, null, 'Slice:30', { est: true }],
  ['mozzarella', 'Mozzarella', 'mocarela', 300, 22.2, 2.2, 22.4, 0, 1, 13.2, 627, 'Portion:50'],
  ['cheddar', 'Cheddar', 'çedar', 403, 24.9, 1.3, 33.1, 0, 0.5, 21.1, 621, 'Slice:28'],
  ['cream-cheese', 'Cream cheese', 'krem djathi', 342, 6, 4.1, 34, 0, 3.2, 19.3, 321, '1 tbsp:15'],
  ['butter', 'Butter', 'gjalpë', 717, 0.9, 0.1, 81.1, 0, 0.1, 51.4, 11, '1 tsp:5'],
  ['ice-cream', 'Ice cream (vanilla)', 'akullore', 207, 3.5, 23.6, 11, 0.7, 21.2, 6.8, 80, '1 scoop:66'],
  // Albanian dishes (typical estimates)
  ['byrek-djathe', 'Byrek me djathë', 'burek byrek cheese pie', 290, 9, 26, 17, null, null, null, null, '1 piece:150', { est: true }],
  ['byrek-spinaq', 'Byrek me spinaq', 'burek byrek spinach pie', 240, 7, 24, 13, null, null, null, null, '1 piece:150', { est: true }],
  ['byrek-mish', 'Byrek me mish', 'burek byrek meat pie', 280, 10, 24, 16, null, null, null, null, '1 piece:150', { est: true }],
  ['tave-kosi', 'Tavë kosi', 'tave kosi elbasani', 150, 11, 6, 9, null, null, null, null, '1 portion:300', { est: true }],
  ['fergese', 'Fërgesë', 'fergese tirane', 160, 6, 6, 12, null, null, null, null, '1 portion:250', { est: true }],
  ['qofte', 'Qofte (fried)', 'qofte meatballs', 250, 16, 8, 17, null, null, null, null, '4 qofte:120', { est: true }],
  ['sufllaqe', 'Sufllaqe (gyro pita)', 'sufllaqe gyros kebab doner', 230, 10, 25, 10, null, null, null, null, '1 sufllaqe:300', { est: true }],
  ['petulla', 'Petulla', 'petulla fried dough', 330, 7, 45, 14, null, null, null, null, '3 pieces:120', { est: true }],
  ['bakllava', 'Bakllava', 'bakllava baklava', 428, 6.7, 37.6, 29, 2.5, 18, null, null, '1 piece:60'],
  ['trilece', 'Trileçe', 'trilece tres leches', 270, 6, 40, 9, null, null, null, null, '1 slice:120', { est: true }],
  // Nuts, fats, sweets
  ['olive-oil', 'Olive oil', 'vaj ulliri', 884, 0, 0, 100, 0, 0, 13.8, 2, '1 tbsp:13.5'],
  ['almonds', 'Almonds', 'bajame', 579, 21.2, 21.6, 49.9, 12.5, 4.4, 3.8, 1, 'Handful:28'],
  ['walnuts', 'Walnuts', 'arra', 654, 15.2, 13.7, 65.2, 6.7, 2.6, 6.1, 2, 'Handful:28'],
  ['hazelnuts', 'Hazelnuts', 'lajthi', 628, 15, 16.7, 60.8, 9.7, 4.3, 4.5, 0, 'Handful:28'],
  ['peanuts', 'Peanuts', 'kikirikë', 567, 25.8, 16.1, 49.2, 8.5, 4, 6.3, 18, 'Handful:28'],
  ['peanut-butter', 'Peanut butter', 'gjalpë kikiriku', 588, 25, 20, 50, 6, 9.2, 10.3, 459, '1 tbsp:16'],
  ['sunflower-seeds', 'Sunflower seeds', 'fara luledielli', 584, 20.8, 20, 51.5, 8.6, 2.6, 4.5, 9, 'Handful:28'],
  ['dark-chocolate', 'Dark chocolate 70%', 'çokollatë e zezë', 598, 7.8, 45.9, 42.6, 10.9, 24, 24.5, 20, '2 squares:20'],
  ['milk-chocolate', 'Milk chocolate', 'çokollatë', 535, 7.7, 59.4, 29.7, 3.4, 51.5, 18.5, 79, '1 bar:45'],
  ['hazelnut-spread', 'Hazelnut spread', 'nutella krem lajthie', 539, 6.3, 57.5, 30.9, 3.4, 56.3, 10.6, 41, '1 tbsp:15'],
  ['honey', 'Honey', 'mjaltë', 304, 0.3, 82.4, 0, 0.2, 82.1, 0, 4, '1 tbsp:21'],
  ['sugar', 'Sugar', 'sheqer', 387, 0, 100, 0, 0, 100, 0, 1, '1 tsp:4'],
  ['jam', 'Jam', 'reçel marmelatë', 250, 0.4, 68.9, 0.1, 1.1, 48.5, 0, 32, '1 tbsp:20'],
  ['cookies', 'Cookies (choc chip)', 'biskota', 488, 5.4, 64.4, 24.7, 2, 35, 8.5, 386, '1 cookie:16'],
  ['chips', 'Potato chips', 'çipsa patatina', 536, 7, 52.9, 34.6, 3.1, 0.3, 3.1, 525, '1 bag:40'],
  ['popcorn', 'Popcorn (plain)', 'kokoshka', 387, 13, 77.8, 4.5, 14.5, 0.9, 0.6, 8, '1 bowl:25'],
  ['ketchup', 'Ketchup', 'keçap', 101, 1, 27.4, 0.1, 0.3, 22.8, 0, 907, '1 tbsp:17'],
  ['mayonnaise', 'Mayonnaise', 'majonezë', 680, 1, 0.6, 75, 0, 0.6, 11.7, 635, '1 tbsp:14'],
  ['whey', 'Whey protein powder', 'proteinë', 380, 78, 6, 5, null, 3, 2.5, 200, '1 scoop:30', { est: true }],
  ['hamburger', 'Hamburger', 'hamburger', 254, 12.9, 30.3, 9.1, 1.2, 5.9, 3.4, 466, '1 burger:110'],
  // Drinks (per 100 ml)
  ['espresso', 'Espresso', 'kafe ekspres', 9, 0.1, 1.7, 0.2, 0, 0, 0.1, 14, '1 shot:30', { ml: true, caf: 212 }],
  ['coffee', 'Coffee (black)', 'kafe amerikane', 1, 0.1, 0, 0, 0, 0, 0, 2, '1 cup:240', { ml: true, caf: 40 }],
  ['turkish-coffee', 'Turkish coffee', 'kafe turke', 2, 0.1, 0.3, 0, 0, 0, 0, 2, '1 cup:60', { ml: true, caf: 90, est: true }],
  ['cappuccino', 'Cappuccino', 'kapuçino', 40, 2.2, 3.3, 2, 0, 3.3, 1.2, 35, '1 cup:180', { ml: true, caf: 40 }],
  ['latte', 'Latte', 'late makiato', 51, 3.3, 4.9, 2.1, 0, 4.9, 1.2, 40, '1 cup:300', { ml: true, caf: 25 }],
  ['black-tea', 'Black tea', 'çaj', 1, 0, 0.3, 0, 0, 0, 0, 3, '1 cup:240', { ml: true, caf: 20 }],
  ['green-tea', 'Green tea', 'çaj jeshil', 1, 0.2, 0, 0, 0, 0, 0, 1, '1 cup:240', { ml: true, caf: 12 }],
  ['mountain-tea', 'Mountain tea', 'çaj mali', 1, 0, 0.2, 0, 0, 0, 0, 1, '1 cup:240', { ml: true }],
  ['cola', 'Cola', 'koka kola coca', 42, 0, 10.6, 0, 0, 10.6, 0, 4, '1 can:330', { ml: true, caf: 10 }],
  ['cola-zero', 'Cola zero', 'koka kola zero', 0.4, 0, 0, 0, 0, 0, 0, 4, '1 can:330', { ml: true, caf: 10 }],
  ['orange-juice', 'Orange juice', 'lëng portokalli', 45, 0.7, 10.4, 0.2, 0.2, 8.4, 0, 1, '1 glass:250', { ml: true }],
  ['energy-drink', 'Energy drink', 'pije energjike', 45, 0, 11, 0, 0, 11, 0, 40, '1 can:250', { ml: true, caf: 32 }],
  ['beer', 'Beer', 'birrë', 43, 0.5, 3.6, 0, 0, 0, 0, 4, '1 bottle:330', { ml: true }],
  ['red-wine', 'Red wine', 'verë e kuqe', 85, 0.1, 2.6, 0, 0, 0.6, 0, 4, '1 glass:150', { ml: true }],
  ['white-wine', 'White wine', 'verë e bardhë', 82, 0.1, 2.6, 0, 0, 1, 0, 5, '1 glass:150', { ml: true }],
  ['raki', 'Raki', 'raki rakia', 231, 0, 0, 0, 0, 0, 0, 1, '1 shot:40', { ml: true, est: true }],
  ['ayran', 'Dhallë (ayran)', 'dhallë dhalle ayran', 38, 1.7, 2.4, 1.9, 0, 2.4, 1.2, 280, '1 glass:250', { ml: true, est: true }],
]

export interface BaseFood {
  id: string
  draft: FoodDraft
  /** Typical estimate rather than reference data. */
  estimate: boolean
  search: string
}

/** Lower-case, accents folded: "Mollë" ~ "molle". */
export function fold(s: string): string {
  return normalizeName(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ç/g, 'c')
}

export const FOOD_BASE: BaseFood[] = ROWS.map(([id, name, aliases, kcal, proteinG, carbsG, fatG, fiberG, sugarG, satFatG, sodiumMg, servings, extra]) => {
  const unit = extra?.ml ? 'ml' : 'g'
  return {
    id,
    estimate: !!extra?.est,
    search: fold(`${name} ${aliases}`),
    draft: {
      name,
      brand: null,
      barcode: null,
      basis: extra?.ml ? '100ml' : '100g',
      ...emptyNutrients(),
      kcal,
      proteinG,
      carbsG,
      fatG,
      fiberG,
      sugarG,
      satFatG,
      sodiumMg,
      caffeineMg: extra?.caf ?? (extra?.ml ? 0 : null),
      servings: servings.split('|').map((s) => {
        const [label, g] = s.split(':')
        return { label: `${label} (${g} ${unit})`, grams: Number(g) }
      }),
      ingredients: null,
      source: 'generic',
      sourceId: `gen:${id}`,
    },
  }
})

/** Common foods matching a query (any word prefix of the name or an alias). */
export function searchBase(query: string, limit = 12): BaseFood[] {
  const q = fold(query)
  if (!q) return []
  const words = q.split(' ')
  return FOOD_BASE.filter((f) => words.every((w) => f.search.split(' ').some((t) => t.startsWith(w)) || f.search.includes(w)))
    .sort((a, b) => Number(fold(b.draft.name).startsWith(q)) - Number(fold(a.draft.name).startsWith(q)) || a.draft.name.length - b.draft.name.length)
    .slice(0, limit)
}
