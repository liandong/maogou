var mongo = require('mongodb');
var Collection = require('./Collection');
/*
 * @description 支持单集合批量操作 mongodb数据库类
 * @param{object} params:{database:ip:post:args:}
 */
    
function Bongo() {
    var username = null;
    var password = null;
    var authed = false;
    var igrep = false;
    var me = this;
    var _dbList = [];
    
    
    function resolve(callback, db) {
        return function(err, collection) {
            if (db) {
                _dbList.push(db);
            }
            if (callback) {
                callback(err, collection);
            }
        }
    }
    
    /**
     * @param{string} coName 文档名称
     * @param{function} callback 回调函数
     */
     function execute(coName, callback) {
          var db = me.db;
          
          if (!password || authed) {
              db.open(function(err, db) {
                  db.collection(coName, resolve(callback, db));
              });
              return;
          }
          
          db.open(function(err, db) {
              db.authenticate(username, password, function(err, result) { 
                  if (!result) {
                    callback('Authenticate failed!');
                    return; 
                  }
                  //authed = true;
                  db.collection(coName, resolve(callback, db)); 
                });  
              }
          );
    }
    
    /**
     * 将字符串关联数组转为模糊查询条件 
     */
    function itrans(selector) {
        if (!igrep) {
            return;
        }
        for (var item in selector) {
            var v = selector[item];
            
            if ((typeof v == 'string') ) {
                var c = v.charAt(0);
                if (c == '*') {
                    v = v.replace(/\*/g , '.*');
                    try {
                        var r = new RegExp(v);
                        if (r) {
                            selector[item] = r;
                        }
                    }
                    catch (ex) {}
                }
                else if(c == '!') {
                    selector[item] = null;
                }
            }
        }
        return selector;
    }
    
    /**
     * update a document, if not exists, insert the doc.
     * @param{string} coName 文档名称
     * @param{function} callback 回调函数
     */
    this.update = function(coName, selector, docs, options, callback) {
         //options.upsert = true;
         //options.w = 1;
         itrans(selector);
         
         function action(err, collection) {
             collection.update(selector, docs, options, callback);  
         }
         execute(coName, action);
    }
    
    this.ensureIndex = function(colName, fname, options, callback) {
        execute(colName, function(err, collection) {
            collection.ensureIndex(fname, options, callback);
        });
    }
    
    this.dropIndex = function(colName, name, options, callback) {
        execute(colName, function(err, collection) {
            collection.dropIndex(name, callback);
        });
    }
    
    
    this.connect = function(params, cols) {
        username = params.username;
        password = params.password;
        igrep = params.igrep;
        
        cols || (cols = []);
        ('string' == typeof cols) && (cols = [cols]);
        
        me.__defineGetter__('db', function() {
            var server = new mongo.Server(params.ip, params.port, {});
            return new mongo.Db(params.db, server, {w:1});
        });

        cols.forEach(function(item) {
            me[item] = new Collection(item, me);
        });
    }

    /*
     * @param{object} json必须包含key,
     * date和data属性，其中key指定数据库集合名，date为数据产生的日期，data为数据的集合
     * @param{function} func为回调函数
     */
    this.save = function(col, json, options, callback) {
        execute(col, function(err, collection) {
            collection.insert(json, function(err, docs) {
              collection.count(function(err, count) {
                callback(null, {count: count});
              });
            });
        });
    }

    this.find = function(col, selector, options, callback) {
        var arr = [];
        execute(col, function(err, collection) {
            if (err) {
                callback(err, null);
            }
            else {
                itrans(selector);
                var cursor = collection.find(selector, options || {});
                cursor.toArray(callback);
            }
        });
    }
    
    this.findOne = function(col, selector, options, callback) {
        var arr = [];
        execute(col, function(err, collection) {
            if (err) {
                callback && callback({msg:'error'});
            }
            else {
                itrans(selector);
                collection.findOne(selector, options, callback);
            }
        });
    }
    
    this.geoNear = function(col, loc, options, callback) {
        var arr = [];
        execute(col, function(err, collection) {
            if (err) {
                callback && callback({msg:'error'});
            }
            else {
                if (options.query) {
                    itrans(options.query);
                }
                collection.geoNear(loc[0], loc[1], options, callback);
            }
        });
    }
    
    this.count = function(col, options, callback) {
        execute(col, function(err, collection) {
            collection.count({}, callback);
        })
    }
    
    this.remove = function(col, selector, options, callback) {
        execute(col, function(err, collection) {
            if (err) {
                callback(err, {});
                return;
            }
            
            itrans(selector);

            collection.remove(selector, options, callback);        
        });
    }
    
    /**
     *  @params {String} colName Collection对应名称
     *  @params {Function} map 如果是String，则视为按字段group，函数为map过程函数
     *  @params {Function} reduce过程函数
     *  @params {Function}
     */
    this.mapReduce = function(colName, map, reduce, options, callback) {
        if(typeof map == 'string') {
            var key = map;
            map = 'function() {emit(this.'
                    + map
                    +', 1);}';
        }
        else if(map === null) {
            map = function() { emit(this._id, 1); }
        }
        
        options.out = {replace : 'tempCollection'};
        execute(colName, function(err, collection) {
           collection.mapReduce(map, reduce, options, 
               function(err, collection) {
                   if (collection) {
                       collection.find().toArray(callback);
                   }
                   else {
                       callback(err, null);
                   }
               }
            );
        });
   }
           
    this.close = function() {
       var db = _dbList.shift();
       while (db) {
           db.close();
           db = _dbList.shift();
       }
    }
}

module.exports = Bongo; 