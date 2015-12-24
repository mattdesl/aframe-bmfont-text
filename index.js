var createGeometry = require('three-bmfont-text')
var loadBMFont = require('load-bmfont')
var path = require('path')
var assign = require('object-assign')
var createSDF = require('three-bmfont-text/shaders/sdf')
var createBasic = require('three-bmfont-text/shaders/basic')

var alignments = ['left', 'right', 'center']
module.exports.component = {
  schema: {
    scale: { default: 0.1 },
    anchor: { default: 'left', oneOf: alignments },
    baseline: { default: 'bottom', oneOf: alignments },
    align: { default: 'left', oneOf: alignments },
    font: { default: '' },
    text: { default: '' },
    flipY: { default: true },
    width: { default: undefined },
    mode: { default: 'normal' },
    letterSpacing: { default: 0 },
    lineHeight: { default: undefined },
    tabSize: { default: 4 }
  },

  init: function () {
    this._texture = new THREE.Texture()
    this._geometry = createGeometry()

    this._updateMaterial()
    this._mesh = new THREE.Mesh(this._geometry, this._material)

    this.el.addEventListener('componentchanged', function (ev) {
      if (ev.detail.name === 'material') {
        this._updateMaterial()
      }
    }.bind(this))
  },

  _coerceData: function (data) {
    // We have to coerce some data to numbers/booleans
    data = assign({}, data)
    if (typeof data.lineHeight !== 'undefined') {
      data.lineHeight = parseFloat(data.lineHeight)
      if (!isFinite(data.lineHeight)) data.lineHeight = undefined
    }
    if (typeof data.width !== 'undefined') {
      data.width = parseFloat(data.width)
      if (!isFinite(data.width)) data.width = undefined
    }
    return data
  },

  _updateMaterial: function () {
    // can't use computed attribute since it
    // gives us `false` as transparent
    var material = this.el.getAttribute('material')

    var data = {
      side: threeSideFromString(material.side || 'double'),
      transparent: String(material.transparent) !== 'false',
      alphaTest: parseFloat(material.alphaTest),
      color: material.color || '#ffffff',
      opacity: parseFloat(material.opacity),
      map: this._texture
    }

    // set some defaults
    if (!isFinite(data.alphaTest)) {
      delete data.alphaTest
    }
    if (!isFinite(data.opacity)) {
      data.opacity = 1.0
    }

    var sdf = material.shader === 'sdf'
    var shader = sdf ? createSDF(data) : createBasic(data)
    this._material = new THREE.RawShaderMaterial(shader)
    if (this._mesh) {
      this._mesh.material = this._material
    }
  },

  update: function (oldData) {
    var data = this._coerceData(this.data)

    // decide whether to update font, or just text data
    if (!oldData || oldData.font !== data.font) {
      // new font, will also subsequently change data & layout
      this._updateFont()
    } else if (this._currentFont) {
      // new data like change of text string
      var font = this._currentFont
      this._geometry.update(assign({}, data, { font: font }))
      this._updateLayout(data)
    }

    var scale = data.scale
    this._mesh.scale.set(scale, -scale, scale)
  },

  _updateLayout: function (data) {
    var scale = data.scale
    var layout = this._geometry.layout

    var x = 0
    var y = 0

    // anchors text left/center/right
    switch (data.anchor) {
      case 'left': x = 0; break
      case 'right': x = -layout.width; break
      case 'center':
        x = -layout.width / 2
        break
    }

    // anchors text to top/center/bottom
    switch (data.baseline) {
      case 'bottom': y = 0; break
      case 'top': y = -layout.height + layout.ascender; break
      case 'center':
        y = -layout.height / 2
        break
    }

    this._mesh.position.x = scale * x
    this._mesh.position.y = scale * y
    this._geometry.computeBoundingSphere()
  },

  remove: function () {
    this._geometry.dispose()
    this._geometry = null
  },

  _updateFont: function () {
    if (!this.data.font) {
      console.error(new TypeError('No font specified for bmfont text!'))
      return
    }

    var geometry = this._geometry
    var self = this
    this._mesh.visible = false
    loadBMFont(this.data.font, onLoadFont)

    function onLoadFont (err, font) {
      if (err) {
        console.error(new Error('Error loading font ' + data.font +
          '\nMake sure the path is correct and that it points' +
          ' to a valid BMFont file (xml, json, fnt).\n' + err.message))
        return
      }
      if (font.pages.length !== 1) {
        console.error(new Error('Currently only single-page bitmap fonts are supported.'))
        return
      }
      var data = self._coerceData(self.data)
      var image = font.pages[0]
      var src = path.dirname(data.font) + '/' + image

      geometry.update(assign({}, data, { font: font }))
      self._mesh.geometry = geometry

      var obj3d = self.el.object3D
      if (obj3d.children.indexOf(self._mesh) === -1) {
        self.el.object3D.add(self._mesh)
      }

      loadTexture(src, onLoadTexture)
      self._currentFont = font
      self._updateLayout(data)
    }

    function onLoadTexture (image) {
      self._mesh.visible = true
      if (image) {
        self._texture.image = image
        self._texture.needsUpdate = true
      }
    }
  }
}

function loadTexture (src, cb) {
  var loader = new THREE.ImageLoader()
  loader.load(src, function (image) {
    cb(image)
  }, undefined, function () {
    console.error('Could not load bmfont texture "' + src +
      '"\nMake sure it is correctly defined in the bitmap .fnt file.')
    cb(null)
  })
}

function threeSideFromString (str) {
  switch (str) {
    case 'double': return THREE.DoubleSide
    case 'front': return THREE.FrontSide
    case 'back': return THREE.BackSide
    default:
      throw new TypeError('unknown side string ' + str)
  }
}
