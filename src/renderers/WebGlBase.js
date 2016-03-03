/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

var WebGlCommon = require('./WebGlCommon');
var createConstantBuffers = WebGlCommon.createConstantBuffers;
var destroyConstantBuffers = WebGlCommon.destroyConstantBuffers;
var createShaderProgram = WebGlCommon.createShaderProgram;
var destroyShaderProgram = WebGlCommon.destroyShaderProgram;
var setViewport = WebGlCommon.setViewport;
var setupPixelEffectUniforms = WebGlCommon.setupPixelEffectUniforms;

var setDepth = WebGlCommon.setDepth;
var setTexture = WebGlCommon.setTexture;

var glslify = require('glslify');
var vertexSrc = glslify('../shaders/vertexNormal');
var fragmentSrc = glslify('../shaders/fragmentNormal');

var vertexIndices = [0, 1, 2, 0, 2, 3];
var vertexPositions = [-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, 0.5, 0.5, 0.0, -0.5, 0.5, 0.0];
var textureCoords = [0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];

var attribList = ['aVertexPosition', 'aTextureCoord'];
var uniformList = ['vtMatrix', 'vccMatrix', 'uDepth', 'uSampler', 'uOpacity', 'colorOffset', 'colorMatrix'];

var mat4 = require('gl-matrix/src/gl-matrix/mat4');
var vec3 = require('gl-matrix/src/gl-matrix/vec3');


function WebGlBaseRenderer(gl) {
  this.gl = gl;

  // vtMatrix is the matrix which has the view and tile transforms
  // Seams are visible at large zoom levels when the projection and tile
  // matrices are multiplied in the vertex shader. Therefore they are
  // multiplied in Javascript.
  this.vtMatrix = mat4.create();

  // vccMatrix is the matrix to compensate for viewport clamping
  // see the setViewport() function for more details
  this.vccMatrix = mat4.create();

  this.translateVector = vec3.create();
  this.scaleVector = vec3.create();

  this.constantBuffers = createConstantBuffers(this.gl, vertexIndices, vertexPositions, textureCoords);

  this.shaderProgram = createShaderProgram(this.gl, vertexSrc, fragmentSrc, attribList, uniformList);
}

WebGlBaseRenderer.prototype.destroy = function() {

  this.vtMatrix = null;
  this.vccMatrix = null;
  this.translateVector = null;
  this.scaleVector = null;

  destroyConstantBuffers(this.gl, this.constantBuffers);
  this.constantBuffers = null;

  destroyShaderProgram(this.gl, this.shaderProgram);
  this.shaderProgram = null;

  this.gl = null;

};

WebGlBaseRenderer.prototype.startLayer = function(layer, rect) {
  var gl = this.gl;
  var shaderProgram = this.shaderProgram;
  var constantBuffers = this.constantBuffers;

  gl.useProgram(shaderProgram);

  setViewport(gl, layer, rect, this.vccMatrix);
  gl.uniformMatrix4fv(shaderProgram.vccMatrix, false, this.vccMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, constantBuffers.vertexPositions);
  gl.vertexAttribPointer(shaderProgram.aVertexPosition, 3, gl.FLOAT, gl.FALSE, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, constantBuffers.textureCoords);
  gl.vertexAttribPointer(shaderProgram.aTextureCoord, 2, gl.FLOAT, gl.FALSE, 0, 0);


  setupPixelEffectUniforms(gl, layer.effects(), {
    opacity: shaderProgram.uOpacity,
    colorOffset: shaderProgram.colorOffset,
    colorMatrix: shaderProgram.colorMatrix
  });
};


WebGlBaseRenderer.prototype.endLayer = function() {};


WebGlBaseRenderer.prototype.renderTile = function(tile, texture, layer, layerZ) {

  var gl = this.gl;
  var shaderProgram = this.shaderProgram;
  var constantBuffers = this.constantBuffers;
  var vtMatrix = this.vtMatrix;
  var translateVector = this.translateVector;
  var scaleVector = this.scaleVector;

  translateVector[0] = tile.centerX();
  translateVector[1] = tile.centerY();
  translateVector[2] = -0.5;

  scaleVector[0] = tile.scaleX();
  scaleVector[1] = tile.scaleY();
  scaleVector[2] = 1;

  mat4.copy(vtMatrix, layer.view().projection());
  mat4.rotateX(vtMatrix, vtMatrix, tile.rotX());
  mat4.rotateY(vtMatrix, vtMatrix, tile.rotY());
  mat4.translate(vtMatrix, vtMatrix, translateVector);
  mat4.scale(vtMatrix, vtMatrix, scaleVector);

  gl.uniformMatrix4fv(shaderProgram.vtMatrix, false, vtMatrix);

  setDepth(gl, shaderProgram, layerZ, tile.z);

  setTexture(gl, shaderProgram, texture);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, constantBuffers.vertexIndices);
  gl.drawElements(gl.TRIANGLES, vertexIndices.length, gl.UNSIGNED_SHORT, 0);
};


module.exports = WebGlBaseRenderer;