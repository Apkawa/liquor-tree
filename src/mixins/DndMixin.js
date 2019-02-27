const DropPosition = {
  ABOVE: 'drag-above',
  BELOW: 'drag-below',
  ON: 'drag-on'
}

function isMovingStarted (event, start) {
  return Math.abs(event.clientX - start[0]) > 5 || Math.abs(event.clientY - start[1]) > 5
}

function composedPath (event) {
  let el = event.target
  const path = []

  while (el) {
    path.push(el)

    if (el.tagName === 'HTML') {
      path.push(document)
      path.push(window)

      return path
    }

    el = el.parentElement
  }

  return path
}

function getPath (event) {
  if (event.path) {
    return event.path
  }

  if (event.composedPath) {
    return event.composedPath()
  }

  return composedPath(event)
}

function getSelectedNode (event) {
  let className
  let i = 0

  const path = getPath(event)

  for (; i < path.length; i++) {
    className = path[i].className || ''

    if (/tree-node/.test(className)) {
      return path[i]
    }
  }

  return null
}

function getDropDestination (e) {
  const selectedNode = getSelectedNode(e)

  if (!selectedNode) {
    return null
  }

  return selectedNode
}

function updateHelperClasses (target, classes) {
  if (!target) {
    return
  }

  let className = target.className

  if (!classes) {
    for (const i in DropPosition) {
      className = className.replace(DropPosition[i], '')
    }

    className.replace('dragging', '')
  } else if (!new RegExp(classes).test(className)) {
    className += ' ' + classes
  }

  target.className = className.replace(/\s+/g, ' ')
}

function getDropPosition (e, element) {
  const coords = element.getBoundingClientRect()
  const nodeSection = coords.height / 3

  let dropPosition = DropPosition.ON

  if (coords.top + nodeSection >= e.clientY) {
    dropPosition = DropPosition.ABOVE
  } else if (coords.top + nodeSection * 2 <= e.clientY) {
    (
      dropPosition = DropPosition.BELOW
    )
  }

  return dropPosition
}

function callDndCb (args, opts, method) {
  if (!opts || !opts[method] || typeof opts[method] !== 'function') {
    return Promise.resolve(true)
  }
  const result = opts[method](...args)
  // TODO utils.isPromise(result)
  if (result && typeof result['then'] === 'function') {
    return result
  }
  return Promise.resolve(result !== false)
}

function clearDropClasses (parent) {
  for (const key in DropPosition) {
    const el = parent.querySelectorAll(`.${DropPosition[key]}`)

    for (let i = 0; i < el.length; i++) {
      updateHelperClasses(el[i])
    }
  }
}

export default {
  methods: {
    onDragStart (e) {
      e.preventDefault()
    },

    startDragging (nodes, event) {
      // TODO drag multiple
      if (nodes.map(n => n.isDraggable()).filter(b => !b).length > 0) {
        return
      }

      callDndCb([nodes, event], this.tree.options.dnd, 'onDragStart')
        .then(result => {
          if (result !== false) {
            this.$$startDragPosition = [event.clientX, event.clientY]
            this.$$possibleDragNode = nodes
            this.initDragListeners()
          }
        })
    },

    initDragListeners () {
      let dropPosition

      const removeListeners = () => {
        window.removeEventListener('mouseup', onMouseUp, true)
        window.removeEventListener('mousemove', onMouseMove, true)
      }

      const onMouseUp = (e) => {
        if (!this.$$startDragPosition) {
          e.stopPropagation()
        }

        if (this.draggableNode) {
          this.draggableNode.nodes.forEach(node => node.state('dragging', false))
        }

        if (this.$$dropDestination && this.tree.isNode(this.$$dropDestination) && this.$$dropDestination.vm) {
          updateHelperClasses(this.$$dropDestination.vm.$el, null)

          // TODO drag multiple
          const dragNodes = this.draggableNode.nodes
          const $$dropDestination = this.$$dropDestination
          callDndCb(
            [dragNodes, $$dropDestination, dropPosition, e],
            this.tree.options.dnd,
            'onDragFinish'
          )
            .then(cbResult => {
              if (cbResult !== false && !(!$$dropDestination.isDropable() && dropPosition === DropPosition.ON || !dropPosition)) {
                // TODO handle multiple
                dragNodes.forEach(node => node.finishDragging($$dropDestination, dropPosition))
              }
              this.$$dropDestination = null
            })
        }
        this.$$possibleDragNode = null
        this.$set(this, 'draggableNode', null)
        removeListeners()
      }

      const onMouseMove = (e) => {
        if (this.$$startDragPosition && !isMovingStarted(e, this.$$startDragPosition)) {
          return
        } else {
          this.$$startDragPosition = null
        }

        if (this.$$possibleDragNode) {
          if (this.$$possibleDragNode[0].startDragging() === false) {
            removeListeners()
            this.$$possibleDragNode = null
            return
          }

          this.$set(this, 'draggableNode', { nodes: this.$$possibleDragNode, left: 0, top: 0 })
          this.$$possibleDragNode = null
        }

        this.draggableNode.left = e.clientX
        this.draggableNode.top = e.clientY

        const dropDestination = getDropDestination(e)

        clearDropClasses(this.$el)

        const dragNodes = this.draggableNode.nodes
        if (dropDestination) {
          const dropDestinationId = dropDestination.getAttribute('data-id')

          if (dragNodes[0].id === dropDestinationId) {
            return
          }

          if (!this.$$dropDestination || this.$$dropDestination.id !== dropDestinationId) {
            this.$$dropDestination = this.tree.getNodeById(dropDestinationId)
          }

          if (this.$$dropDestination && dragNodes.length) {
            const path = this.$$dropDestination.getPath()
            // FIXME check logic?
            const isDropDestination = dragNodes.map(n => path.includes(n)).filter(Boolean).length
            if (isDropDestination) {
              this.$$dropDestination = null
              return
            }
          }

          dropPosition = getDropPosition(e, dropDestination)
          // TODO drag multiple
          callDndCb(
            [dragNodes, this.$$dropDestination, dropPosition, e],
            this.tree.options.dnd,
            'onDragOn'
          )
            .then(cbResult => {
              const dropTarget = this.$$dropDestination

              let isDropable = dropTarget.isDropable() && cbResult
              if (dropTarget.parent && dropPosition !== DropPosition.ON && !dropTarget.parent.isDropable()) {
                // Permit drop into children
                isDropable = false
                dropPosition = null
              }
              console.log(dropTarget.isDropable(), dropTarget.parent.isDropable(), isDropable)
              if (!isDropable && dropPosition === DropPosition.ON) {
                dropPosition = null
              }
              updateHelperClasses(dropDestination, dropPosition)
            })
        }
      }

      window.addEventListener('mouseup', onMouseUp, true)
      window.addEventListener('mousemove', onMouseMove, true)
    }
  }
}
