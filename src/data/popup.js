self.port.on('setupPanel', setupPanel);
self.port.on('logInnerHTML', logInnerHTML);

function setupPanel(opt, engineObjs)
{
	var enginesElement = document.getElementById('engines');

	switch (opt.hoverBehavior)
	{
		case 0:  enginesElement.className = "engines hover-nothing"; break;
		case 1:  enginesElement.className = "engines hover-highlight-only"; break;
		case 2:  enginesElement.className = "engines hover-highlight-and-move"; break;
		default: enginesElement.className = "engines"; break;
	}

	for (var i = 0; i < engineObjs.length; i++) {
		addEngineToLayout(engineObjs[i], enginesElement);
	}

	var itemHeight = opt.itemSize + 8;
	var itemWidth = opt.itemSize + opt.itemPadding * 2;

	var nItemsPerRow = (opt.useSingleRow ? engineObjs.length : opt.nItemsPerRow);
	var height = itemHeight * Math.ceil(engineObjs.length / nItemsPerRow);
	var width = itemWidth * nItemsPerRow;

	enginesElement.style.height = height + "px";
	enginesElement.style.width = width + "px";
	enginesElement.style.paddingTop = opt.popupPaddingY;
	enginesElement.style.paddingBottom = opt.popupPaddingY;
	enginesElement.style.paddingLeft = opt.popupPaddingX;
	enginesElement.style.paddingRight = opt.popupPaddingX;

	var icons = enginesElement.getElementsByTagName('img');
	var padding = opt.itemPadding + "px";
	var size = opt.itemSize + "px";

	for (var i = 0; i < icons.length; i++) {
		var icon = icons[i];
		icon.style.height = size;
		icon.style.width = size;
		icon.style.paddingLeft = padding;
		icon.style.paddingRight = padding;
	}
}

function addEngineToLayout(engineObj, enginesElement)
{
	var icon = document.createElement("img");
	icon.setAttribute("src", (engineObj.iconSpec != null ? engineObj.iconSpec : "default.png"));
	icon.addEventListener("mouseup", onSearchEngineClick(engineObj));
	enginesElement.appendChild(icon);
}

function onSearchEngineClick(engineObj)
{
	return function(e) {
		if (e.which == 1) {
			self.port.emit('onSearchEngineLeftClick', engineObj);
		} else if (e.which == 2) {
			self.port.emit('onSearchEngineMiddleClick', engineObj);
		} else {
			//
		}
	}
}

function logInnerHTML()
{
	console.log(document.documentElement.innerHTML);
}
