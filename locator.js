var locator = {};
locator.webdb = {};
locator.webdb.db = null;

locator.webdb.open = function() {
  var dbSize = 5 * 1024 * 1024; // 5MB
  locator.webdb.db = openDatabase("Locator", "1.0", "Locator DB", dbSize);
};

locator.webdb.createTables = function() {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("CREATE TABLE IF NOT EXISTS polygon_point(id INTEGER PRIMARY KEY ASC, lat REAL, lng REAL, sort INTEGER)", [], null, locator.webdb.onError);
    tx.executeSql("CREATE TABLE IF NOT EXISTS item(id STRING PRIMARY KEY ASC, title TEXT, price REAL, link TEXT, address TEXT, lat REAL, lng REAL, hidden BOOLEAN)", [], null, locator.webdb.onError);
  });
};

locator.webdb.addItem = function(result, success) {
  var db = locator.webdb.db;
  db.transaction(function(tx){
    tx.executeSql("INSERT INTO item(id, title, price, link, address, lat, lng, hidden) VALUES (?,?,?,?,?,?,?,?)",
        [result.id, result.title, result.price, result.link, result.address, result.lat, result.lng, 0],
        success,
        locator.webdb.onError);
   });
};

locator.webdb.onError = function(tx, e) {
  alert("There has been an error: " + e.message);
};

locator.webdb.onSuccess = function(tx, r) {
  // re-render the data.
};

locator.webdb.get_item = function(id, success) {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("SELECT * FROM item WHERE id = ?", [id], success,
        locator.webdb.onError);
  });
};

locator.webdb.get_items = function(success) {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("SELECT * FROM item", [], success, locator.webdb.onError);
  });
};

locator.webdb.getPolygon = function(success) {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("SELECT lat, lng FROM polygon_point ORDER BY sort ASC", [], success, locator.webdb.onError);
  });
};

locator.webdb.setPolygon = function(polygon, success) {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("DELETE FROM polygon_point", [], null, locator.webdb.onError);
    for(var i = 0; i < polygon.length; i++) {
      var point = polygon.getAt(i);
      tx.executeSql("INSERT INTO polygon_point(lat, lng, sort) VALUES (?,?,?)", [point.lat(), point.lng(), i], null,
        locator.webdb.onError);
    }
    if (success) {
      success();
    }
  });
};

locator.webdb.hideItem = function(id, success) {
  var db = locator.webdb.db;
  db.transaction(function(tx) {
    tx.executeSql("UPDATE item SET hidden = 1 WHERE id = ?", [id], success, locator.webdb.onError);
  });
};

locator.webdb.init = function() {
  locator.webdb.open();
  locator.webdb.createTables();
};

// POLYGON MANAGER
locator.polygon_manager = {};

locator.polygon_manager.save = function(shape) {
  locator.webdb.setPolygon(shape.getPath());
};

locator.polygon_manager.load = function(shape) {
  locator.webdb.getPolygon(function(tx, rs) {
    var path = [];
    for(var i = 0; i < rs.rows.length; i++) {
      point = rs.rows.item(i);
      path.push(new google.maps.LatLng(point.lat, point.lng));
    }
    shape.setPath(path);
  });
};

// LOGGER
locator.logger = {};

locator.logger.init = function(element) {
  locator.logger.element = element;
};

locator.logger.log = function(text) {
  current = locator.logger.element.text();
  locator.logger.element.text(current + "\n" + text);
};

// ITEM MANAGER
locator.item_manager = {};

locator.item_manager.init = function(geocoder_queue) {
  locator.item_manager.geocoder = geocoder_queue;
};

locator.item_manager.exists = function(id, callback) {
  locator.webdb.get_item(id, function(tx, rs) {
    callback(rs.rows.length > 0);
  });
};

locator.item_manager.get_item = function(id, callback) {
  locator.webdb.get_item(id, function(tx, rs) {
    if (rs.rows.item(0).hidden != 1) {
      callback(rs.rows.item(0));
    }
  });
};

locator.item_manager.get_items = function(callback) {
  locator.webdb.get_items(function(tx, rs) {
    for(var i = 0; i < rs.rows.length; i++) {
      if (rs.rows.item(i).hidden != 1) {
        callback(rs.rows.item(i));
      }
    }
  });
};

locator.item_manager.hide_item = function(item) {
  locator.webdb.hideItem(item.id, null);
};


locator.item_manager.find_or_create = function(item, should_geocode, success) {
  locator.webdb.get_item(item.id, function(tx, rs) {
    if (rs.rows.length > 0) {
      if (rs.rows.item(0).hidden != 1) {
        success(rs.rows.item(0));
      }
    } else {
      if (item.has_location) {
        locator.webdb.addItem(item, function(){
          locator.item_manager.get_item(item.id, success);
        });
      } else if (should_geocode) {
        locator.item_manager.geocoder.geocode(item.address, function(location) {
          item.lat = location.lat();
          item.lng = location.lng();
          locator.webdb.addItem(item, function(){
            locator.item_manager.get_item(item.id, success);
          });
        });
      }
    }
  });
};

locator.item_manager.build_zonaprop_result = function(result) {
  return {
    id: result.postId,
    link: result.viewItemUrl,
    title: result.title,
    lat: result.coordinates ? result.coordinates.latitude : null,
    lng: result.coordinates ? result.coordinates.longitude : null,
    price: result.price ? result.price.replace(/[^\d]/g,"") : null,
    has_location: result.coordinates ? !result.coordinates.empty : false,
    address: result.title + ", Argentina"
  };
};

locator.item_manager.build_meli_result = function(result) {
  return {
    id: result.id,
    link: result.permalink,
    title: result.title,
    lat: result.location.latitude,
    lng: result.location.longitude,
    price: result.price,
    has_location: result.location.latitude && result.location.longitude,
    address: result.location.address_line + ", Capital Federal, Buenos Aires, Argentina"
  };
};

// MELI

locator.meli = {};

locator.meli.init = function() {
  MELI.init({client_id: 6586});
  locator.meli.options = {
    'category': 'MLA1459', // inmuebles
    '9991459-AMLA_1459_2': '9991459-AMLA_1459_2-MMLA12620', //alquiler
    'state': 'TUxBUENBUGw3M2E1', // capital federal
    'price': '*-3000.0', // hasta 3000 pesos
    'limit': 200
  };
};

locator.meli.clear = function() {
  locator.meli.page = 0;
  locator.meli.inited = false;
  locator.meli.options.offset = 0;
}

locator.meli.get_results = function(success, finish) {
  locator.meli.clear();
  locator.meli.get_all_results(success, finish);
}

locator.meli.get_all_results = function(success, finish) {
  locator.meli.options.offset = locator.meli.options.limit * locator.meli.page;
  MELI.get("/sites/MLA/search", locator.meli.options, function(data) {
    if (!locator.meli.inited) {
      locator.meli.inited = true;
      locator.meli.total = data[2].paging.total;
    }

    success(data[2].results);

    locator.meli.page += 1;
    var loaded = locator.meli.page * locator.meli.options.limit;

    if (loaded < locator.meli.total) {
      window.setTimeout(locator.meli.get_all_results, 0, success, finish);
    } else {
      if (finish) {
        finish();
      }
    }
  });
};

locator.meli.set_top_price = function(price) {
  locator.meli.options.price = "*-" + price;
};

// MAP

locator.map = {};

locator.map.init = function() {
  var mapOptions = {
    center: new google.maps.LatLng(-34.58192, -58.462742),
    zoom: 13,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };

  locator.map.map = new google.maps.Map(document.getElementById("map"), mapOptions);

  var initial_path = [new google.maps.LatLng(-34.5792350829308, -58.47893714904785), new google.maps.LatLng(-34.584747005730755, -58.488807678222656), new google.maps.LatLng(-34.5890573572886, -58.48468780517578), new google.maps.LatLng(-34.5817084268363, -58.474388122558594), new google.maps.LatLng(-34.58305106841928, -58.469581604003906), new google.maps.LatLng(-34.585877611377505, -58.46151351928711), new google.maps.LatLng(-34.58729084680454, -58.4553337097168), new google.maps.LatLng(-34.585453636062574, -58.453874588012695), new google.maps.LatLng(-34.57838706236286, -58.46005439758301), new google.maps.LatLng(-34.57414682974966, -58.4597110748291), new google.maps.LatLng(-34.570047732637164, -58.45773696899414), new google.maps.LatLng(-34.563757345818374, -58.4637451171875), new google.maps.LatLng(-34.57351077620322, -58.48039627075195), new google.maps.LatLng(-34.575701606821, -58.48400115966797)];

  locator.map.shape = new google.maps.Polygon({
    paths: initial_path,
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 3,
    fillColor: '#FF0000',
    fillOpacity: 0.35,
    editable: true
  });

  locator.map.shape.setMap(locator.map.map);

  google.maps.event.addListener(locator.map.map, 'rightclick', function(e) {
    var vertices = locator.map.shape.getPath();
    vertices.push(e.latLng);
  });

  locator.map.info_window = new google.maps.InfoWindow({maxWidth: 500});

  locator.map.markers = [];
};

locator.map.remove_last = function() {
  locator.map.shape.getPath().pop();
};

locator.map.clear_polygon = function() {
  locator.map.shape.setPath([]);
};

locator.map.add_item = function(item) {
  var point = new google.maps.LatLng(item.lat, item.lng);
  var isWithinPolygon = locator.map.shape.containsLatLng(point);
  if (isWithinPolygon) {
    var marker = new google.maps.Marker({
      position: point,
      draggable: true,
      map: locator.map.map
    });

    locator.map.markers.push(marker);

    google.maps.event.addListener(marker, 'click', (function(marker, content) {
      return function() {
        locator.map.info_window.setContent(content);
        locator.map.info_window.open(locator.map.map, marker);
      }
    })(marker, locator.map.get_content(item)));

    google.maps.event.addListener(marker, 'rightclick', (function(marker, item) {
      return function() {
        marker.setMap(null);
        locator.item_manager.hide_item(item);
      }
    })(marker, item));
  }
};

locator.map.get_content = function(item) {
  var title = "<p>" + item.title + "</p>";
  var price = "<p>Price: " + item.price + "</p>";
  var link = '<a href="' + item.link + '">' + item.link + '</a>';
  return title + price + link;
};

locator.map.clear = function() {
  for (var i = 0; i < locator.map.markers.length; i++) {
    locator.map.markers[i].setMap(null);
  }
  locator.map.markers = [];
};

// Geocoding queue
locator.geocoding_queue = {};

locator.geocoding_queue.init = function(element) {
  locator.geocoding_queue.geocoder = new google.maps.Geocoder();
  locator.geocoding_queue.queue = [];
  locator.geocoding_queue.running = false;
  locator.geocoding_queue.timeout = 1000;
  locator.geocoding_queue.indicator = element;
  locator.geocoding_queue.refresh_indicator();
};

locator.geocoding_queue.refresh_indicator = function() {
  if (locator.geocoding_queue.indicator) {
    locator.geocoding_queue.indicator.text(locator.geocoding_queue.queue.length);
  }
}

locator.geocoding_queue.geocode = function(address, success) {
  locator.geocoding_queue.queue.push({
    address: address,
    success: success
  });

  locator.geocoding_queue.try_run();
};

locator.geocoding_queue.try_run = function() {
  locator.geocoding_queue.refresh_indicator();

  if (locator.geocoding_queue.running || locator.geocoding_queue.queue.length == 0) {
    return;
  }

  locator.geocoding_queue.running = true;
  var next = locator.geocoding_queue.queue.pop();
  var geocoder = locator.geocoding_queue.geocoder;

  geocoder.geocode({'address': next.address}, function(results, status) {
    if (status == google.maps.GeocoderStatus.OK) {
      var location = results[0].geometry.location;
      next.success(location);
    } else {
      locator.logger.log("Could not geocode address: " + next.address + ". Status: " + status + ". Item not saved!");
    }
    window.setTimeout(function(){
      locator.geocoding_queue.running = false;
      locator.geocoding_queue.try_run();
    }, locator.geocoding_queue.timeout);
  });
}

// Zonaprop

locator.zonaprop = {};

locator.zonaprop.init = function() {
  locator.zonaprop.search_url = "http://propiedades.zonaprop.com.ar/alquiler-capital-federal/opZtipo-operacion-alquiler_lnZ3642_prZARS-0-{top_price}_soZprasc_pnZ{page}";
  locator.zonaprop.item_url = "http://propiedades.zonaprop.com.ar/preview/showPostPreview.json?idPost=";
  locator.zonaprop.limit = 48;
  locator.zonaprop.top_price = 3000;
};

locator.zonaprop.clear = function() {
  locator.zonaprop.page = 1;
  locator.zonaprop.inited = false;
}

locator.zonaprop.format_search_url  = function() {
  return locator.zonaprop.search_url.supplant({
    page: locator.zonaprop.page,
    top_price: locator.zonaprop.top_price
  });
}

locator.zonaprop.get = function(url, success) {
  $.getJSON('http://whateverorigin.org/get?url=' + encodeURIComponent(url) + '&callback=?', success);
}

locator.zonaprop.get_results = function(success, finish) {
  locator.zonaprop.clear();
  locator.zonaprop.get_all_results(success, finish);
}

locator.zonaprop.get_all_results = function(success, finish) {
  locator.zonaprop.get(locator.zonaprop.format_search_url(), function(data){
    var content = $.parseHTML(data.contents);
    if (!locator.zonaprop.inited) {
      locator.zonaprop.inited = true;
      locator.zonaprop.total = parseInt($('#resultado strong', content).text());
    }

    var ids = $('div[postid]', content).map(function(i,e){return $(e).attr('postid')});

    $.each(ids, function(i, id) {
      locator.item_manager.exists(id, function(result) {
        if (result) {
          success({id: id});
        } else {
          locator.zonaprop.get(locator.zonaprop.item_url + id, function(data) {
            var result = $.parseJSON(data.contents);
            success(locator.item_manager.build_zonaprop_result(result));
          });
        }
      });
    });

    var loaded = locator.zonaprop.page * locator.zonaprop.limit;
    locator.zonaprop.page += 1;

    if (loaded < locator.zonaprop.total) {
      window.setTimeout(locator.zonaprop.get_all_results, 0, success, finish);
    } else {
      if (finish) {
        finish();
      }
    }
  });
};

$(function(){
  // Init DB
  locator.webdb.init();

  // Init Logger
  locator.logger.init($('#logger'));

  // Init meli
  locator.meli.init();

  // Init zonaprop
  locator.zonaprop.init();

  // Init map
  locator.map.init();

  // Init queue
  locator.geocoding_queue.init($('#queue_size'));

  // Init Item Manager
  locator.item_manager.init(locator.geocoding_queue);

  $('#remove_last').click(locator.map.remove_last);

  $('#clear_polygon').click(locator.map.clear_polygon);

  $('#save_polygon').click(function() {
    locator.polygon_manager.save(locator.map.shape);
  });

  $('#load_polygon').click(function() {
    locator.polygon_manager.load(locator.map.shape);
  });

  $('#load_meli').click(function(){
    $('#status').text('Loading...');
    locator.map.clear();
    locator.meli.get_results(function(results) {
      for(var i = 0; i < results.length; i++) {
        var result = results[i];
        var meli_item = locator.item_manager.build_meli_result(result);
        locator.item_manager.find_or_create(meli_item, true, function(item) {
          locator.map.add_item(item);
        });
      }
    }, function() {
      $('#status').text('Loaded!');
    });
  });

  $('#load_zonaprop').click(function(){
    $('#status').text('Loading...');
    locator.map.clear();
    locator.zonaprop.get_results(function(result) {
      locator.item_manager.find_or_create(result, true, function(item) {
        locator.map.add_item(item);
      });
    }, function() {
      $('#status').text('Loaded!');
    });
  });

  $('#load_local').click(function(){
    locator.map.clear();
    locator.item_manager.get_items(function(item) {
      if (item.price <= parseFloat($('#price').val())) {
        locator.map.add_item(item);
      }
    });
  });

  $('#price').change(function(){
    locator.meli.set_top_price($(this).val());
    locator.zonaprop.top_price($(this).val());
  });
});
