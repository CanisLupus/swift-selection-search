self.port.on('setup', setup);
self.port.on('onSelection', onSelection);
self.port.on('destroyPopup', destroyPopup);

popup = null;
selection = null;
popupEngineObjs = null;
popupOptions = null;
popupCss = null;

mousePositionX = 0;
mousePositionY = 0;

function setup(popupLocation)
{
	if (popupLocation == 1) {	// option "At cursor location"
		document.addEventListener('mousemove', onMouseUpdate);
		document.addEventListener('mouseenter', onMouseUpdate);
	}
	// console.log("setup print");
}

function onSelection(options, engineObjs)
{
	var s = window.getSelection();

	if (s == null || s.toString().length == 0) {
		return;
	}

	// disable popup in contentEditable elements, such as Gmail's compose window
	for (var elem = s.anchorNode; elem !== document; elem = elem.parentNode)
	{
		if (elem.isContentEditable === undefined) {
			continue;	// check parent for value
		} else if (elem.isContentEditable === true) {
			return;		// quit
		} else /*if (elem.isContentEditable === false)*/ {
			break;		// create popup
		}
	}

	selection = s;
	popupEngineObjs = engineObjs;
	popupOptions = options;

	if (popup != null) {
		showPopup(options, engineObjs);
	} else {
		createPopup(options, engineObjs);
	}
}

function createPopup(options, engineObjs)
{
	// destroy old popup, if any
	if (popup != null) {
		destroyPopup();
	}

	popup = document.createElement('engines');
	popup.id = "swift-selection-search-engines";
	popup.style.paddingTop = options.popupPaddingY + "px";
	popup.style.paddingBottom = options.popupPaddingY + "px";
	popup.style.paddingLeft = options.popupPaddingX + "px";
	popup.style.paddingRight = options.popupPaddingX + "px";

	setPopupPositionAndSize(popup, selection, engineObjs, options);

	switch (options.hoverBehavior) {
		case 0: popup.className = "hover-nothing"; break;
		case 1: popup.className = "hover-highlight-only"; break;
		case 2: popup.className = "hover-highlight-and-move"; break;
		default: break;
	}

	document.body.appendChild(popup);

	var padding = options.itemPadding + "px";
	var size = options.itemSize + "px";

	for (var i = 0; i < engineObjs.length; i++) {
		var icon = addEngineToLayout(engineObjs[i], popup);
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;
	}

	popupCss = getPopupStyle();
	document.body.appendChild(popupCss);

	document.body.addEventListener('keypress', hidePopup);
	document.body.addEventListener('mousedown', hidePopup);		// hide popup from a press down anywhere...
	popup.addEventListener('mousedown', stopEventPropagation);	// ...except on the popup itself

	if (popupOptions.hidePopupOnPageScroll) {
		window.addEventListener("scroll", onPageScroll);
	}
}

function setPopupPositionAndSize(popup, selection, engineObjs, options)
{
	var itemHeight = options.itemSize + 8;
	var itemWidth = options.itemSize + options.itemPadding * 2;

	var nItemsPerRow = (options.useSingleRow ? engineObjs.length : options.nItemsPerRow);
	var height = itemHeight * Math.ceil(engineObjs.length / nItemsPerRow);
	var width = itemWidth * nItemsPerRow;

	var range = selection.getRangeAt(0); // get the text range
	var rect = range.getBoundingClientRect();

	var positionLeft;
	var positionTop;

	if (options.popupLocation == 1) {
		positionLeft = mousePositionX;
		positionTop = mousePositionY;
	} else /*if (options.popupLocation == 0) {*/ {
		positionLeft = rect.right + window.pageXOffset;
		positionTop = rect.bottom + window.pageYOffset;
	}

	// center horizontally
	positionLeft -= width / 2;

	// don't leave the page
	if (positionLeft < 5) {
		positionLeft = 5;
	} else if (positionLeft + width + 10 > document.body.offsetWidth + window.pageXOffset) {
		positionLeft = document.body.offsetWidth + window.pageXOffset - width - 10;
	}

	if (positionTop < 5) {
		positionTop = 5;
	} else if (positionTop + height + 10 > document.body.offsetHeight + window.pageYOffset) {
		positionTop = document.body.offsetHeight + window.pageYOffset - height - 10;
	}

	// set values
	popup.style.width = width + "px";
	popup.style.height = height + "px";
	popup.style.left = positionLeft + "px";
	popup.style.top = positionTop + "px";
}

function getPopupStyle()
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
	/*cursor:default;*/
	/*display:inline;*/
	float:none;
	font-family:Arial, Helvetica, sans-serif;
	font-size:medium;
	font-style:normal;
	font-weight:normal;
	/*height:auto;*/
	/*left:auto;*/
	letter-spacing:normal;
	line-height:normal;
	max-height:none;
	max-width:none;
	min-height:0;
	min-width:0;
	/*overflow:visible;*/
	/*position:static;*/
	right:auto;
	/*text-align:left;*/
	text-decoration:none;
	text-indent:0;
	text-transform:none;
	/*top:auto;*/
	visibility:visible;
	white-space:normal;
	/*width:auto;*/
	/*z-index:auto;*/
}

#swift-selection-search-engines {
	position: absolute;
	z-index: 2147483647;
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
	vertical-align: top;
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
	if (popupOptions.popupAnimationDuration > 0) {
		var duration = popupOptions.popupAnimationDuration / 1000.0;
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

function addEngineToLayout(engineObj, popup)
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
	popup.appendChild(icon);
	return icon;
}

function onPageScroll()
{
	if (popup != null) {
		hidePopup();
	}
}

function stopEventPropagation(e)
{
	e.stopPropagation();
}

function hidePopup()
{
	// console.log("hidePopup");
	if (popup != null) {
		popup.style.display = "none";
	}
}

function showPopup(options, engineObjs)
{
	if (popup != null) {
		popup.style.display = "inline-block";
		setPopupPositionAndSize(popup, selection, engineObjs, options);
	}
}

function destroyPopup()
{
	if (popup != null) {
		document.body.removeChild(popup);
		document.body.removeChild(popupCss);
		popup = null;

		document.removeEventListener('mousemove', onMouseUpdate);
		document.removeEventListener('mouseenter', onMouseUpdate);
		document.body.removeEventListener('keypress', hidePopup);
		document.body.removeEventListener('mousedown', hidePopup);
		window.removeEventListener("scroll", onPageScroll);
		// other listeners are destroyed along with the popup objects
	}
}

function onMouseUpdate(e)
{
	// console.log("on mouse update");
	mousePositionX = e.pageX;
	mousePositionY = e.pageY;
}

function onSearchEngineClick(engineObj)
{
	return function(e) {
		if (popupOptions.hidePopupOnSearch) {
			hidePopup();
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
