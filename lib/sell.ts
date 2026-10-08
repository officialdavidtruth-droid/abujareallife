/* Sell-back values. Shared by the server (which pays them) and the Inventory screen (which shows them).
   Always below the buy price, so buying and selling back can never be used to make money; sell to other players on the Market for more. */
export const ITEM_SELL = 0.5, VEHICLE_SELL = 0.6, PROPERTY_SELL = 0.7;
export const itemSellValue = (cost: number) => Math.max(1, Math.floor(cost * ITEM_SELL));
export const vehicleSellValue = (price: number, condition = 100) => Math.max(1, Math.floor(price * VEHICLE_SELL * (0.5 + 0.5 * Math.max(0, Math.min(100, condition)) / 100)));
export const propertySellValue = (price: number) => Math.max(1, Math.floor(price * PROPERTY_SELL));

/* Abuja Online Mall: delivered to your bag, so it costs the shelf price plus an 8% delivery fee. Shared by the server (charges it) and the Market screen (shows it). */
export const MALL_FEE = 0.08;
export const mallPrice = (cost: number) => Math.ceil(cost * (1 + MALL_FEE));
