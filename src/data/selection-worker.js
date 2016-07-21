function onSelection(options, engineObjs)
{
	var s = window.getSelection();

	if (s == null || s.toString().length == 0) {
		return;
	}

	// special case to disable popup in gmail compose screen
	// if (s.anchorNode.baseURI.indexOf("mail.google.com") && s.anchorNode.parentElement.className.indexOf("editable") > -1) {
	// 	return;
	// }

	selection = s;
	panelEngineObjs = engineObjs;
	panelOptions = options;

	createPanel(options, engineObjs);
}

function createPanel(options, engineObjs)
{
	// destroy old panel, if any
	if (popupPanel != null) {
		destroyPopupPanel();
	}

	if (options.popupLocation == 1) {	// option "At mouse location"
		document.addEventListener('mousemove', onMouseUpdate, false);
		document.addEventListener('mouseenter', onMouseUpdate, false);
	}

	popupPanel = document.createElement('engines');
	popupPanel.id = "swift-selection-search-engines";
	popupPanel.style.position = 'absolute';
	popupPanel.style.paddingTop = options.popupPaddingY + "px";
	popupPanel.style.paddingBottom = options.popupPaddingY + "px";
	popupPanel.style.paddingLeft = options.popupPaddingX + "px";
	popupPanel.style.paddingRight = options.popupPaddingX + "px";
	popupPanel.style.zIndex = 2147483647;

	recalculatePanelPositionAndSize(popupPanel, selection, engineObjs, options);

	switch (options.hoverBehavior) {
		case 0: popupPanel.className = "hover-nothing"; break;
		case 1: popupPanel.className = "hover-highlight-only"; break;
		case 2: popupPanel.className = "hover-highlight-and-move"; break;
		default: break;
	}

	document.body.addEventListener('keypress', function(e) {
		destroyPopupPanel();
	});

	// destroy panel from a press down anywhere...
	document.body.addEventListener('mousedown', function(e) {
		destroyPopupPanel();
	});
	// ...except the popup panel
	popupPanel.addEventListener('mousedown', function(e) {
		e.stopPropagation();
	});

	document.body.appendChild(popupPanel);

	var padding = options.itemPadding + "px";
	var size = options.itemSize + "px";

	for (var i = 0; i < engineObjs.length; i++) {
		var icon = addEngineToLayout(engineObjs[i], popupPanel);
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;
	}

	if (panelCss == null) {
		panelCss = getPopupPanelStyle();
		document.body.appendChild(panelCss);
	}

	window.addEventListener("scroll", onPageScroll);
}

function recalculatePanelPositionAndSize(popupPanel, selection, engineObjs, options)
{
	var itemHeight = options.itemSize + 8;
	var itemWidth = options.itemSize + options.itemPadding * 2;

	var nItemsPerRow = (options.useSingleRow ? engineObjs.length : options.nItemsPerRow);
	var height = itemHeight * Math.ceil(engineObjs.length / nItemsPerRow);
	var width = itemWidth * nItemsPerRow;

	var range = selection.getRangeAt(0); // get the text range
	var rect = range.getBoundingClientRect();

	if (options.popupLocation == 1) {
		positionLeft = mousePositionX;
		positionTop = mousePositionY;
	} else /*if (options.popupLocation == 0) {*/ {
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	}

	if (options.doHorizontalCentering) {
		positionLeft -= width / 2;
	}

	// don't leave the screen
	if (positionLeft < 5) {
		positionLeft = 5;
	} else if (positionLeft + width + 10 > document.body.offsetWidth) {
		positionLeft = document.body.offsetWidth - width - 10;
	}

	if (positionTop < 5) {
		positionTop = 5;
	} else if (positionTop + height + 10 > document.body.offsetHeight) {
		positionTop = document.body.offsetHeight - height - 10;
	}

	// set values
	popupPanel.style.width = width + "px";
	popupPanel.style.height = height + "px";
	popupPanel.style.left = positionLeft + "px";
	popupPanel.style.top = positionTop + "px";
}

function getPopupPanelStyle()
{
	var css = document.createElement("style");
	css.type = "text/css";
	css.innerHTML =
`#swift-selection-search-engines,
#swift-selection-search-engines *,
#swift-selection-search-engines a:hover,
#swift-selection-search-engines a:visited,
#swift-selection-search-engines a:active {
	background:none;
	border:none;
	bottom:auto;
	box-sizing: content-box;
	clear:none;
	cursor:default;
	display:inline;
	float:none;
	font-family:Arial, Helvetica, sans-serif;
	font-size:medium;
	font-style:normal;
	font-weight:normal;
	height:auto;
	left:auto;
	letter-spacing:normal;
	line-height:normal;
	max-height:none;
	max-width:none;
	min-height:0;
	min-width:0;
	overflow:visible;
	position:static;
	right:auto;
	text-align:left;
	text-decoration:none;
	text-indent:0;
	text-transform:none;
	top:auto;
	visibility:visible;
	white-space:normal;
	width:auto;
	z-index:auto;
}

#swift-selection-search-engines {
	padding: 2px;
	margin: 0px;
	text-align: center;
	overflow: hidden;
	display: inline-block;
	background-color: white;
	box-shadow: 0px 0px 3px rgba(0,0,0,.5);
}

#swift-selection-search-engines img {
	padding: 4px 2px;
	cursor: pointer;
}

#swift-selection-search-engines.hover-nothing img:hover {
}

#swift-selection-search-engines.hover-highlight-only img:hover {
	border-bottom: 2px #4099ff solid;
	border-radius: 2px;
	padding-bottom: 2px;
}

#swift-selection-search-engines.hover-highlight-and-move img:hover {
	border-bottom: 3px #4099ff solid;
	border-radius: 2px;
	padding-top: 1px;
}`;
	if (panelOptions.popupPanelAnimationDuration > 0) {
		var duration = panelOptions.popupPanelAnimationDuration / 1000.0;
		css.innerHTML +=
`#swift-selection-search-engines {
	animation: fadein `+duration+`s;
	animation: pop `+duration+`s;
}

@keyframes fadein {
    from { opacity: 0; }
    to   { opacity: 1; }
}

@keyframes pop {
    0%   { transform: scale(0.8);   }
    100% { transform: scale(1);   }
}`;
	}
	return css;
}

function addEngineToLayout(engineObj, popupPanel)
{
	var icon = document.createElement("img");
	icon.setAttribute("src", (engineObj.iconSpec != null ? engineObj.iconSpec : "default.png"));
	icon.addEventListener("mouseup", onSearchEngineClick(engineObj));
	icon.addEventListener("mousedown", function(e) {
		if (e.which == 2) {
			e.preventDefault();
		}
	});
	icon.title = engineObj.name;
	popupPanel.appendChild(icon);
	return icon;
}

function onPageScroll()
{
	if (popupPanel != null) {
		if (panelOptions.hidePopupPanelOnPageScroll) {
			destroyPopupPanel();
		} else {
			recalculatePanelPositionAndSize(popupPanel, selection, panelEngineObjs, panelOptions)
		}
	}
}

function destroyPopupPanel()
{
	if (popupPanel != null) {
		document.body.removeChild(popupPanel);
		popupPanel = null;
	}
	if (panelCss != null) {
		document.body.removeChild(panelCss);
		panelCss = null;
	}
}

function onMouseUpdate(e)
{
	mousePositionX = e.pageX;
	mousePositionY = e.pageY;
}

function onSearchEngineClick(engineObj)
{
	return function(e) {
		if (panelOptions.hidePopupPanelOnSearch) {
			destroyPopupPanel();
		}

		if (e.which == 1 || e.which == 2) {
			if (e.ctrlKey) {
				self.port.emit('onSearchEngineCtrlClick', selection.toString(), engineObj);
			} else if (e.which == 1) {
				self.port.emit('onSearchEngineLeftClick', selection.toString(), engineObj);
			} else /*if (e.which == 2)*/ {
				self.port.emit('onSearchEngineMiddleClick', selection.toString(), engineObj);
			}
		}
	}
}

popupPanel = null;
selection = null;
panelEngineObjs = null;
panelOptions = null;
panelCss = null;

mousePositionX = null;
mousePositionY = null;

self.port.on('onSelection', onSelection);
self.port.on('destroyPopupPanel', destroyPopupPanel);
