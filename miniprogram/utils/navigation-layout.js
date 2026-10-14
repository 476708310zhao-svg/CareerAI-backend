function getNavigationLayout() {
  let windowInfo = {};
  try {
    windowInfo = typeof wx.getWindowInfo === 'function'
      ? wx.getWindowInfo()
      : wx.getSystemInfoSync();
  } catch (error) {}

  const statusBarHeight = Number(windowInfo.statusBarHeight) || 24;
  let menu = null;
  try {
    menu = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? wx.getMenuButtonBoundingClientRect()
      : null;
  } catch (error) {}

  const menuBottom = menu && Number(menu.bottom);
  return {
    statusBarHeight,
    navTop: menuBottom ? menuBottom + 12 : statusBarHeight + 44
  };
}

module.exports = { getNavigationLayout };
